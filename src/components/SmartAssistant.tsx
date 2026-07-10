import { useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Check, Lightbulb, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { applyRules } from '../utils/classificationRules';
import { extractAndNormalizeRUT } from '../utils/rutParser';

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
    try {
      if (options.persistRule) await saveRule(suggestion);

      const { error } = await supabase
        .from('transactions')
        .update(suggestion.proposal)
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', gap: '1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }}>✅</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>¡Todo clasificado!</h2>
        <p style={{ color: '#555', maxWidth: 360, margin: 0 }}>No quedan movimientos pendientes de sugerir. Puedes re-escanear si importaste nuevas cartolas.</p>
        <button className="btn btn-outline" style={{ marginTop: '0.5rem', backgroundColor: 'white' }} onClick={handleRescan}>
          <RefreshCw size={16} />
          Re-escanear reglas
        </button>
      </div>
    );
  }

  const strongCount = suggestions.filter(s => s.confidence >= 85).length;
  const progress = ((currentIndex) / suggestions.length) * 100;

  const confidenceColor = current.confidence >= 85 ? '#16a34a' : current.confidence >= 70 ? '#d97706' : '#6b7280';
  const confidenceBg = current.confidence >= 85 ? '#dcfce7' : current.confidence >= 70 ? '#fef3c7' : '#f3f4f6';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', maxWidth: 800, margin: '0 auto' }}>

      {/* Header barra de progreso */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontWeight: 800, fontSize: '1rem' }}>
            {currentIndex + 1} <span style={{ color: '#888', fontWeight: 400 }}>de {suggestions.length} sugerencias</span>
          </span>
          {strongCount > 0 && (
            <button
              className="btn btn-primary"
              style={{ fontSize: '0.78rem', padding: '0.3rem 0.8rem', gap: '0.3rem' }}
              onClick={applyHighConfidence}
              disabled={saving}
            >
              <Check size={14} />
              Aplicar {strongCount} de alta confianza de una vez
            </button>
          )}
        </div>
        <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '0.3rem 0.8rem', backgroundColor: 'white', gap: '0.3rem' }} onClick={handleRescan} disabled={saving}>
          <RefreshCw size={14} />
          Re-escanear
        </button>
      </div>

      {/* Barra de progreso */}
      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 99, marginBottom: '1.5rem', overflow: 'hidden', border: '1px solid black' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'black', borderRadius: 99, transition: 'width 0.3s ease' }} />
      </div>

      {/* Tarjeta principal */}
      <div style={{ border: '2px solid black', borderRadius: 12, boxShadow: '4px 4px 0 black', overflow: 'hidden', background: 'white' }}>

        {/* Descripción */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '2px solid black' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 0.35rem', fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {current.kind === 'rule' ? '📌 Regla guardada' : current.kind === 'recurring' ? '🔁 Recurrente' : '🏪 Comercio detectado'}
              </p>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, wordBreak: 'break-word', textTransform: 'uppercase' }}>
                {current.description}
              </h3>
            </div>
            <div style={{
              padding: '0.3rem 0.75rem',
              background: confidenceBg,
              border: `1.5px solid ${confidenceColor}`,
              borderRadius: 99,
              fontSize: '0.78rem',
              fontWeight: 700,
              color: confidenceColor,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}>
              {current.confidence}% confianza
            </div>
          </div>
        </div>

        {/* Datos del grupo + propuesta en dos columnas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '2px solid black' }}>

          {/* Columna izquierda: datos */}
          <div style={{ padding: '1.25rem 1.5rem', borderRight: '2px solid black' }}>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Movimientos detectados</p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <div style={{ background: '#f3f4f6', border: '1.5px solid #d1d5db', borderRadius: 8, padding: '0.4rem 0.85rem', fontWeight: 700, fontSize: '0.9rem' }}>
                {current.count} {current.count === 1 ? 'movimiento' : 'movimientos'}
              </div>
              <div style={{
                background: current.type === 'ingreso' ? '#dcfce7' : '#fee2e2',
                border: `1.5px solid ${current.type === 'ingreso' ? '#16a34a' : '#dc2626'}`,
                borderRadius: 8,
                padding: '0.4rem 0.85rem',
                fontWeight: 800,
                fontSize: '0.95rem',
                color: current.type === 'ingreso' ? '#15803d' : '#b91c1c'
              }}>
                {current.type === 'ingreso' ? '+' : '-'}${current.total.toLocaleString('es-CL')}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '0.83rem', color: '#555', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
              <Lightbulb size={15} style={{ marginTop: 2, flexShrink: 0, color: '#d97706' }} />
              {current.reason}
            </p>
          </div>

          {/* Columna derecha: propuesta */}
          <div style={{ padding: '1.25rem 1.5rem', background: '#f9fafb' }}>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>Clasificar como</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>Tipo de movimiento</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, background: 'white', border: '1.5px solid black', borderRadius: 8, padding: '0.35rem 0.75rem', display: 'inline-block' }}>
                {current.proposal.tipo_movimiento}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, marginTop: '0.25rem' }}>Categoría</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, background: 'white', border: '1.5px solid black', borderRadius: 8, padding: '0.35rem 0.75rem', display: 'inline-block' }}>
                {current.proposal.categoria_principal}
                {current.proposal.categoria_secundaria && current.proposal.categoria_secundaria !== current.proposal.categoria_principal && (
                  <span style={{ color: '#6b7280', fontWeight: 500 }}> › {current.proposal.categoria_secundaria}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div style={{ padding: '1rem 1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', background: 'white' }}>
          <button
            className="btn btn-primary"
            style={{ flex: '1 1 auto', justifyContent: 'center', gap: '0.4rem' }}
            onClick={() => applySuggestion(current, { persistRule: true })}
            disabled={saving}
          >
            <Check size={16} />
            Aplicar y recordar
          </button>
          <button
            className="btn btn-outline"
            style={{ flex: '0 1 auto', backgroundColor: 'white', gap: '0.4rem', fontSize: '0.85rem' }}
            onClick={() => applySuggestion(current)}
            disabled={saving}
          >
            Solo esta vez
          </button>
          <button
            className="btn btn-outline"
            style={{ flex: '0 1 auto', backgroundColor: 'white', gap: '0.4rem', fontSize: '0.85rem', color: '#888', borderColor: '#d1d5db' }}
            onClick={() => setCurrentIndex(i => Math.min(i + 1, suggestions.length))}
            disabled={saving}
          >
            <X size={15} />
            Omitir
          </button>

          {/* Navegación */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={currentIndex === 0 || saving}
              style={{ padding: '0.4rem 0.65rem', border: '1.5px solid #d1d5db', background: 'white', borderRadius: 8, cursor: 'pointer', color: currentIndex === 0 ? '#d1d5db' : '#374151', fontWeight: 700, fontSize: '1rem' }}
            >
              ←
            </button>
            <button
              onClick={() => setCurrentIndex(i => Math.min(suggestions.length - 1, i + 1))}
              disabled={currentIndex >= suggestions.length - 1 || saving}
              style={{ padding: '0.4rem 0.65rem', border: '1.5px solid #d1d5db', background: 'white', borderRadius: 8, cursor: 'pointer', color: currentIndex >= suggestions.length - 1 ? '#d1d5db' : '#374151', fontWeight: 700, fontSize: '1rem' }}
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
