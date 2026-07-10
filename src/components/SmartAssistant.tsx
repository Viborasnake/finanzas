import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Check, Lightbulb, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { applyRules } from '../utils/classificationRules';
import { extractAndNormalizeRUT } from '../utils/rutParser';
import { CascadingCategorySelector } from '../pages/Transactions';

interface SmartAssistantProps {
  transactions: any[];
  onRefresh: () => void;
}

type Proposal = {
  tipo_movimiento: string;
  categoria_principal: string;
  categoria_secundaria: string;
};

type Suggestion = {
  id: string;
  ids: string[];
  description: string;
  type: 'ingreso' | 'egreso';
  count: number;
  total: number;
  confidence: number;
  reason: string;
  kind: 'rule' | 'transfer' | 'recurring' | 'merchant';
  proposal: Proposal;
  contactName?: string;
  rut?: string | null;
  keyword: string;
};

const HEURISTICS: Array<{ test: RegExp; reason: string; proposal: Proposal; confidence: number }> = [
  { test: /supermercado|lider|jumbo|santa isabel|unimarc|tottus|acuenta|mayorista|novo|global/i, reason: 'Parece compra de supermercado o abarrotes', confidence: 82, proposal: { tipo_movimiento: 'Egreso', categoria_principal: 'Alimentación', categoria_secundaria: 'Abarrotes' } },
  { test: /feria|verduler|fruter|vega/i, reason: 'Parece compra de feria o alimentos frescos', confidence: 78, proposal: { tipo_movimiento: 'Egreso', categoria_principal: 'Alimentación', categoria_secundaria: 'Feria' } },
  { test: /peaje|autopista|tag|costanera|vespucio|pichidangui/i, reason: 'Detecté peaje o autopista', confidence: 92, proposal: { tipo_movimiento: 'Egreso', categoria_principal: 'Transporte', categoria_secundaria: 'Autopista' } },
  { test: /bencina|copec|shell|petrobras|pronto/i, reason: 'Parece carga de combustible', confidence: 86, proposal: { tipo_movimiento: 'Egreso', categoria_principal: 'Transporte', categoria_secundaria: 'Bencina' } },
  { test: /farmacia|cruz verde|salcobrand|ahumada/i, reason: 'Parece farmacia o salud', confidence: 86, proposal: { tipo_movimiento: 'Egreso', categoria_principal: 'Salud', categoria_secundaria: 'Farmacia' } },
  { test: /restaurant|restobar|mcdonald|burger|sushi|pizza|delivery|pedidosya|uber eats|rappi/i, reason: 'Parece restaurante o delivery', confidence: 80, proposal: { tipo_movimiento: 'Egreso', categoria_principal: 'Alimentación', categoria_secundaria: 'Delivery/Restaurantes' } },
  { test: /netflix|spotify|google|openai|chatgpt|claude|amazon prime|hbo/i, reason: 'Parece suscripción digital', confidence: 84, proposal: { tipo_movimiento: 'Egreso', categoria_principal: 'Suscripciones', categoria_secundaria: 'Otras' } },
  { test: /impuesto|linea|tesorer|sii/i, reason: 'Parece pago de impuesto', confidence: 86, proposal: { tipo_movimiento: 'Egreso', categoria_principal: 'Impuestos', categoria_secundaria: 'Otros' } },
  { test: /tarjeta|pago.*tc|pago.*visa|mastercard/i, reason: 'Parece pago de tarjeta de crédito', confidence: 78, proposal: { tipo_movimiento: 'Egreso', categoria_principal: 'Pago Tarjeta Crédito', categoria_secundaria: 'Tarjeta Credito' } },
];

const normalize = (text: any) => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function extractContactName(description: string) {
  const cleaned = description
    .replace(/tef/ig, '')
    .replace(/\b\d{7,9}-?[0-9kK]\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = cleaned.split(' ').filter(p => p.length >= 3 && !/^\d+$/.test(p));
  return parts.slice(0, 3).join(' ') || cleaned;
}

export default function SmartAssistant({ transactions, onRefresh }: SmartAssistantProps) {
  const { user } = useAuth();
  const { classificationRules, saveClassificationRules } = useSettings();
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [overrideProposal, setOverrideProposal] = useState<Proposal | null>(null);

  // Reset override when suggestion changes
  useEffect(() => {
    setOverrideProposal(null);
  }, [currentIndex]);



  const suggestions = useMemo<Suggestion[]>(() => {
    const pending = transactions.filter(t => !t.tipo_movimiento);
    const groups = new Map<string, any[]>();

    pending.forEach(tx => {
      const desc = (tx.description || tx.original_description || '').trim();
      if (!desc) return;
      const key = `${normalize(desc)}__${tx.type}`;
      groups.set(key, [...(groups.get(key) || []), tx]);
    });

    return Array.from(groups.values()).map(group => {
      const first = group[0];
      const description = first.description || first.original_description || '';
      const descNorm = normalize(description);
      const rut = extractAndNormalizeRUT(description);
      const total = group.reduce((sum, tx) => sum + Math.abs(Number(tx.amount || 0)), 0);
      const existingRule = applyRules(description, classificationRules);

      if (existingRule) {
        return {
          id: `rule-${descNorm}`,
          ids: group.map(tx => tx.id),
          description,
          type: first.type,
          count: group.length,
          total,
          confidence: 96,
          reason: 'Coincide con una regla persistente guardada',
          kind: 'rule',
          proposal: existingRule,
          keyword: description
        };
      }

      const isTransfer = /tef|transfer|traspaso|abono/i.test(description);
      if (isTransfer || rut) {
        const inferredName = extractContactName(description);
        return {
          id: `transfer-${descNorm}`,
          ids: group.map(tx => tx.id),
          description,
          type: first.type,
          count: group.length,
          total,
          confidence: group.length > 1 ? 86 : 74,
          reason: group.length > 1 ? 'Transferencia regular detectada por repetición' : 'Parece transferencia a persona',
          kind: 'recurring',
          proposal: {
            tipo_movimiento: first.type === 'ingreso' ? 'Ingreso' : 'Egreso',
            categoria_principal: first.type === 'ingreso' ? 'Transferencias' : 'Transferencias a Otras Personas',
            categoria_secundaria: first.type === 'ingreso' ? 'Transferencias de Otras Personas' : 'Familiares'
          },
          contactName: inferredName,
          rut,
          keyword: description
        };
      }

      const heuristic = HEURISTICS.find(h => h.test.test(description));
      if (heuristic) {
        return {
          id: `merchant-${descNorm}`,
          ids: group.map(tx => tx.id),
          description,
          type: first.type,
          count: group.length,
          total,
          confidence: heuristic.confidence + (group.length > 1 ? 5 : 0),
          reason: group.length > 1 ? `${heuristic.reason}; aparece ${group.length} veces` : heuristic.reason,
          kind: 'merchant',
          proposal: heuristic.proposal,
          keyword: description
        };
      }

      if (group.length > 1) {
        return {
          id: `recurring-${descNorm}`,
          ids: group.map(tx => tx.id),
          description,
          type: first.type,
          count: group.length,
          total,
          confidence: 58,
          reason: 'Movimiento repetido pendiente de regla',
          kind: 'recurring',
          proposal: {
            tipo_movimiento: first.type === 'ingreso' ? 'Ingreso' : 'Egreso',
            categoria_principal: 'Sin Especificar',
            categoria_secundaria: 'Sin Especificar'
          },
          keyword: description
        };
      }

      return null;
    }).filter(Boolean).sort((a: any, b: any) => b.confidence - a.confidence || b.count - a.count) as Suggestion[];
  }, [transactions, classificationRules]);

  const current = suggestions[currentIndex];



  const saveRule = async (suggestion: Suggestion) => {
    const exists = classificationRules.some(r => normalize(r.keyword) === normalize(suggestion.keyword));
    if (exists) return;
    await saveClassificationRules([
      ...classificationRules,
      {
        id: crypto.randomUUID(),
        keyword: suggestion.keyword,
        tipo_movimiento: suggestion.proposal.tipo_movimiento,
        categoria_principal: suggestion.proposal.categoria_principal,
        categoria_secundaria: suggestion.proposal.categoria_secundaria
      }
    ]);
  };

  const applySuggestion = async (suggestion: Suggestion, options: { persistRule?: boolean } = {}) => {
    if (!user) return;
    setSaving(true);
    const effectiveProposal = overrideProposal || suggestion.proposal;
    const effectiveSuggestion = { ...suggestion, proposal: effectiveProposal };
    try {
      if (options.persistRule) await saveRule(effectiveSuggestion);

      const { error } = await supabase
        .from('transactions')
        .update(effectiveProposal)
        .eq('user_id', user.id)
        .in('id', suggestion.ids);

      if (error) throw error;
      toast.success(`${suggestion.count} movimiento${suggestion.count === 1 ? '' : 's'} clasificado${suggestion.count === 1 ? '' : 's'}`);
      await onRefresh();
      setCurrentIndex(0);
    } catch (e: any) {
      toast.error('Error al aplicar sugerencia: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const applyHighConfidence = async () => {
    const strong = suggestions.filter(s => s.confidence >= 85);
    if (!strong.length) {
      toast.error('No hay sugerencias de alta confianza.');
      return;
    }
    setSaving(true);
    try {
      for (const suggestion of strong) {
        await saveRule(suggestion);
        await supabase.from('transactions').update(suggestion.proposal).eq('user_id', user!.id).in('id', suggestion.ids);
      }
      toast.success(`Se aplicaron ${strong.length} sugerencias de alta confianza`);
      await onRefresh();
      setCurrentIndex(0);
    } catch (e: any) {
      toast.error('Error al aplicar lote: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRescan = async () => {
    if (!user) return;
    toast.loading('Escaneando reglas guardadas...', { id: 'rescan_assistant' });
    setLoading(true);
    try {
      let updated = 0;
      for (const tx of transactions.filter(t => !t.tipo_movimiento)) {
        const match = applyRules(tx.description || tx.original_description || '', classificationRules);
        if (!match) continue;
        const { error } = await supabase.from('transactions').update(match).eq('id', tx.id);
        if (error) throw error;
        updated++;
      }
      toast.success(updated ? `Se auto-clasificaron ${updated} transacciones.` : 'No hubo nuevas coincidencias.', { id: 'rescan_assistant' });
      await onRefresh();
      setCurrentIndex(0);
    } catch (e: any) {
      toast.error('Error al escanear: ' + e.message, { id: 'rescan_assistant' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando asistente...</div>;

  if (!current) {
    return (
      <div className="smart-assistant">
        <div style={{ fontSize: '3rem', textAlign: 'center' }}>✅</div>
        <h2 style={{ textAlign: 'center' }}>¡Todo clasificado!</h2>
        <p style={{ textAlign: 'center', maxWidth: 360, margin: '0 auto' }}>No quedan movimientos pendientes de sugerir. Puedes re-escanear si importaste nuevas cartolas.</p>
        <div className="assistant-actions" style={{ justifyContent: 'center', marginTop: '1rem' }}>
          <button className="btn btn-outline" style={{ backgroundColor: 'white' }} onClick={handleRescan}>
            <RefreshCw size={16} />
            Re-escanear reglas
          </button>
        </div>
      </div>
    );
  }

  const strongCount = suggestions.filter(s => s.confidence >= 85).length;
  const progress = (currentIndex / suggestions.length) * 100;
  const confidenceClass = current.confidence >= 85 ? 'confidence-high' : current.confidence >= 70 ? 'confidence-mid' : 'confidence-low';

  return (
    <div className="smart-assistant">

      {/* Header: progreso + acciones globales */}
      <div className="assistant-header-row">
        <span className="assistant-progress-label">
          <strong>{currentIndex + 1}</strong> de {suggestions.length} sugerencias
        </span>
        <div className="assistant-actions" style={{ marginTop: 0 }}>
          {strongCount > 0 && (
            <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.9rem' }} onClick={applyHighConfidence} disabled={saving}>
              <Check size={14} />
              Aplicar {strongCount} de alta confianza
            </button>
          )}
          <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.9rem', backgroundColor: 'white' }} onClick={handleRescan} disabled={saving}>
            <RefreshCw size={14} />
            Re-escanear
          </button>
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="assistant-progress-bar">
        <div className="assistant-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Tarjeta principal */}
      <div className="assistant-card">

        {/* Encabezado: tipo + descripción + badge confianza */}
        <div className="assistant-card-header">
          <div style={{ flex: 1 }}>
            <div className="assistant-kicker">
              {current.kind === 'rule' ? '📌 Regla guardada' : current.kind === 'recurring' ? '🔁 Recurrente' : '🏪 Comercio detectado'}
            </div>
            <h3>{current.description}</h3>
          </div>
          <div className={`assistant-confidence ${confidenceClass}`}>
            {current.confidence}% confianza
          </div>
        </div>

        {/* Cuerpo: dos columnas */}
        <div className="assistant-body-grid">

          {/* Columna izquierda: datos */}
          <div className="assistant-card-main">
            <p className="assistant-section-label">Movimientos detectados</p>
            <div className="assistant-facts">
              <span>{current.count} {current.count === 1 ? 'movimiento' : 'movimientos'}</span>
              <span className={current.type === 'ingreso' ? 'fact-ingreso' : 'fact-egreso'}>
                {current.type === 'ingreso' ? '↑ INGRESO' : '↓ EGRESO'} &nbsp;
                {current.type === 'ingreso' ? '+' : '-'}${current.total.toLocaleString('es-CL')}
              </span>
            </div>
            <p>
              <Lightbulb size={15} style={{ flexShrink: 0, color: '#d97706' }} />
              {current.reason}
            </p>
          </div>

          {/* Columna derecha: selector editable */}
          <div className="assistant-proposal">
            <span>
              Clasificar como
              {overrideProposal && <em style={{ marginLeft: '0.4rem', fontStyle: 'normal', color: '#d97706' }}>✏️ Modificado</em>}
            </span>
            <CascadingCategorySelector
              key={`${current.id}-${currentIndex}`}
              initialPrincipal={overrideProposal?.categoria_principal ?? current.proposal.categoria_principal}
              initialSecundaria={overrideProposal?.categoria_secundaria ?? current.proposal.categoria_secundaria}
              contextDescription={current.description}
              onSave={(tipo: string, principal: string, secundaria: string) => {
                setOverrideProposal({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria });
              }}
            />
          </div>
        </div>

        {/* Acciones por sugerencia */}
        <div className="assistant-actions" style={{ marginTop: 0, borderTop: '2px solid #000', paddingTop: '1rem' }}>
          <button className="btn btn-primary" style={{ flex: '1 1 auto', justifyContent: 'center' }} onClick={() => applySuggestion(current, { persistRule: true })} disabled={saving}>
            <Check size={16} />
            Aplicar y recordar
          </button>
          <button className="btn btn-outline" style={{ backgroundColor: 'white' }} onClick={() => applySuggestion(current)} disabled={saving}>
            Solo esta vez
          </button>
          <button className="btn btn-outline" style={{ backgroundColor: 'white', color: '#64748b' }} onClick={() => setCurrentIndex(i => Math.min(i + 1, suggestions.length))} disabled={saving}>
            <X size={15} />
            Omitir
          </button>
          {/* Navegación */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
            <button className="btn btn-outline" style={{ backgroundColor: 'white', padding: '0.4rem 0.7rem' }} onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0 || saving}>←</button>
            <button className="btn btn-outline" style={{ backgroundColor: 'white', padding: '0.4rem 0.7rem' }} onClick={() => setCurrentIndex(i => Math.min(suggestions.length - 1, i + 1))} disabled={currentIndex >= suggestions.length - 1 || saving}>→</button>
          </div>
        </div>
      </div>
    </div>
  );
}
