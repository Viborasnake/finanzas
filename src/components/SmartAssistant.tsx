import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Bot, Check, ContactRound, Lightbulb, RefreshCw, Sparkles, X } from 'lucide-react';
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
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [contactName, setContactName] = useState('');

  useEffect(() => {
    if (user) fetchContacts();
  }, [user]);

  const fetchContacts = async () => {
    try {
      const { data } = await supabase.from('known_contacts').select('*').eq('user_id', user!.id);
      if (data) setContacts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

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

      const matchingContact = contacts.find(c => {
        const contactRut = c.rut ? extractAndNormalizeRUT(c.rut) : null;
        if (rut && contactRut && rut === contactRut) return true;
        const nameParts = normalize(c.name).split(' ').filter((p: string) => p.length >= 3);
        return nameParts.some((part: string) => descNorm.includes(part));
      });

      const isTransfer = /tef|transfer|traspaso|abono/i.test(description);
      if (isTransfer || matchingContact || rut) {
        const inferredName = matchingContact?.name || extractContactName(description);
        return {
          id: `transfer-${descNorm}`,
          ids: group.map(tx => tx.id),
          description,
          type: first.type,
          count: group.length,
          total,
          confidence: matchingContact ? 94 : group.length > 1 ? 86 : 74,
          reason: matchingContact ? `Coincide con el contacto ${matchingContact.name}` : group.length > 1 ? 'Transferencia regular detectada por repetición' : 'Parece transferencia a persona',
          kind: matchingContact ? 'transfer' : 'recurring',
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
  }, [transactions, contacts, classificationRules]);

  const current = suggestions[currentIndex];

  useEffect(() => {
    setContactName(current?.contactName || '');
  }, [current?.id]);

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

  const addContact = async (suggestion: Suggestion) => {
    if (!user || !contactName.trim()) return;
    const exists = contacts.some(c => normalize(c.name) === normalize(contactName) || (suggestion.rut && c.rut && extractAndNormalizeRUT(c.rut) === suggestion.rut));
    if (exists) return;
    const { data, error } = await supabase
      .from('known_contacts')
      .insert([{ user_id: user.id, name: contactName.trim(), rut: suggestion.rut || null }])
      .select();
    if (error) throw error;
    if (data?.[0]) setContacts(prev => [...prev, data[0]]);
  };

  const applySuggestion = async (suggestion: Suggestion, options: { persistRule?: boolean; persistContact?: boolean } = {}) => {
    if (!user) return;
    setSaving(true);
    try {
      if (options.persistContact) await addContact(suggestion);
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
      <div className="smart-assistant">
        <Bot size={48} style={{ margin: '0 auto 1rem', color: '#3b82f6' }} />
        <h2>Asistente Inteligente</h2>
        <p>No encontré movimientos pendientes para proponer. Puedes volver a escanear reglas guardadas cuando importes más datos.</p>
        <button className="btn btn-outline" style={{ marginTop: '1rem', backgroundColor: 'white' }} onClick={handleRescan}>
          <RefreshCw size={18} />
          Re-escanear reglas
        </button>
      </div>
    );
  }

  const strongCount = suggestions.filter(s => s.confidence >= 85).length;

  return (
    <div className="smart-assistant">
      <div className="smart-assistant-header">
        <div>
          <div className="assistant-kicker"><Sparkles size={16} /> Asistente unificado</div>
          <h2>Clasificación inteligente</h2>
          <p>Revisa grupos repetidos, transferencias y comercios sugeridos. La categorización masiva vive aquí ahora.</p>
        </div>
        <div className="assistant-metrics">
          <span>{suggestions.length} sugerencias</span>
          <span>{strongCount} alta confianza</span>
        </div>
      </div>

      <div className="assistant-actions">
        <button className="btn btn-primary" onClick={applyHighConfidence} disabled={saving || strongCount === 0}>
          <Check size={18} />
          Aplicar alta confianza
        </button>
        <button className="btn btn-outline" onClick={handleRescan} disabled={saving} style={{ backgroundColor: '#fff' }}>
          <RefreshCw size={18} />
          Re-escanear reglas
        </button>
      </div>

      <div className="assistant-card">
        <div className="assistant-card-main">
          <div className="assistant-progress">Sugerencia {currentIndex + 1} de {suggestions.length}</div>
          <h3>{current.description}</h3>
          <div className="assistant-facts">
            <span>{current.count} movimiento{current.count === 1 ? '' : 's'}</span>
            <span>{current.type === 'ingreso' ? '+' : '-'}${current.total.toLocaleString('es-CL')}</span>
            <span>{current.confidence}% confianza</span>
          </div>
          <p><Lightbulb size={18} /> {current.reason}</p>
        </div>

        <div className="assistant-proposal">
          <span>Clasificar como</span>
          <strong>{current.proposal.categoria_secundaria}</strong>
          <small>{current.proposal.tipo_movimiento} / {current.proposal.categoria_principal}</small>
        </div>
      </div>

      {(current.kind === 'transfer' || current.kind === 'recurring') && /transfer|tef|traspaso/i.test(current.description) && (
        <div className="assistant-contact">
          <ContactRound size={20} />
          <div>
            <strong>Guardar contacto para próximas transferencias</strong>
            <input className="input" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nombre del contacto" />
          </div>
        </div>
      )}

      <div className="assistant-actions">
        <button className="btn btn-primary" onClick={() => applySuggestion(current, { persistRule: true, persistContact: !!contactName.trim() })} disabled={saving}>
          <Check size={18} />
          Aplicar y recordar
        </button>
        <button className="btn btn-outline" onClick={() => applySuggestion(current)} disabled={saving} style={{ backgroundColor: '#fff' }}>
          Solo aplicar ahora
        </button>
        <button className="btn btn-outline" onClick={() => setCurrentIndex(i => Math.min(i + 1, suggestions.length))} disabled={saving} style={{ backgroundColor: '#fff' }}>
          <X size={18} />
          Ignorar
        </button>
      </div>
    </div>
  );
}
