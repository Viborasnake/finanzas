import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Check, X, Bot } from 'lucide-react';
import toast from 'react-hot-toast';

interface SmartAssistantProps {
  transactions: any[];
  onRefresh: () => void;
}

export default function SmartAssistant({ transactions, onRefresh }: SmartAssistantProps) {
  const { user } = useAuth();
  const { classificationRules, saveClassificationRules } = useSettings();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (user) {
      fetchContacts();
    }
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

  const dudas = useMemo(() => {
    if (!contacts.length) return [];
    const unclassified = transactions.filter(t => !t.tipo_movimiento);
    const keywords = ['tef ', 'traspaso ', 'transferencia ', 'cargo '];
    
    const candidates: any[] = [];
    const seenDesc = new Set<string>();

    for (const tx of unclassified) {
      const desc = (tx.description || '').toLowerCase();
      
      // Solo una duda por descripción única (para no preguntar 5 veces por el mismo uber)
      if (seenDesc.has(desc)) continue;
      
      // Buscar si parece una transferencia
      const isTransfer = keywords.some(k => desc.includes(k));
      if (!isTransfer) continue;

      // Buscar si coincide con algún contacto
      let matchedContact = null;
      let matchedWord = '';

      for (const c of contacts) {
        if (!c.name) continue;
        const nameParts = c.name.toLowerCase().split(' ').filter((p: string) => p.length >= 3);
        for (const part of nameParts) {
          if (desc.includes(part)) {
            matchedContact = c;
            matchedWord = part;
            break;
          }
        }
        if (matchedContact) break;
      }

      if (matchedContact) {
        // Encontramos una duda!
        candidates.push({
          transaction: tx,
          contact: matchedContact,
          matchedWord
        });
        seenDesc.add(desc);
      }
    }
    return candidates;
  }, [transactions, contacts]);

  const handleAccept = async (duda: any) => {
    const txDesc = (duda.transaction.description || '').toUpperCase();
    
    // 1. Crear Regla
    const rules = [...classificationRules];
    const exists = rules.find(r => r.keyword === txDesc);
    if (!exists) {
      rules.push({
        id: crypto.randomUUID(),
        keyword: txDesc,
        tipo_movimiento: 'Gasto Real',
        categoria_principal: 'Pago a Familiar',
        categoria_secundaria: 'Pago a Familiar'
      });
      await saveClassificationRules(rules);
    }

    // 2. Actualizar en BD todas las txs con esa descripción
    try {
      const { error } = await supabase
        .from('transactions')
        .update({
          tipo_movimiento: 'Gasto Real',
          categoria_principal: 'Pago a Familiar',
          categoria_secundaria: 'Pago a Familiar'
        })
        .eq('user_id', user!.id)
        .eq('description', duda.transaction.description)
        .is('tipo_movimiento', null);
      
      if (error) throw error;
      toast.success('Clasificado y regla guardada ✨');
      onRefresh();
    } catch (e) {
      console.error(e);
      toast.error('Error al clasificar');
    }
  };

  const handleReject = () => {
    setCurrentIndex(prev => prev + 1);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando asistente...</div>;

  if (dudas.length === 0 || currentIndex >= dudas.length) {
    return (
      <div className="card" style={{ backgroundColor: 'var(--pastel-blue)', textAlign: 'center', padding: '3rem' }}>
        <Bot size={48} style={{ margin: '0 auto', marginBottom: '1rem', color: '#3b82f6' }} />
        <h2 style={{ marginBottom: '1rem' }}>¡Estás al día!</h2>
        <p style={{ fontWeight: 500 }}>El Asistente Inteligente no encontró dudas nuevas en tus transacciones sin clasificar.</p>
        <button 
          className="btn btn-outline" 
          style={{ marginTop: '2rem', backgroundColor: 'white' }}
          onClick={() => setCurrentIndex(0)}
        >
          Volver a escanear
        </button>
      </div>
    );
  }

  const currentDuda = dudas[currentIndex];
  const tx = currentDuda.transaction;

  return (
    <div className="card animate-fade-in" style={{ backgroundColor: 'var(--pastel-blue)', border: '4px solid black' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Bot size={32} />
        <h2 style={{ margin: 0 }}>Asistente de Clasificación</h2>
        <span className="badge" style={{ marginLeft: 'auto', backgroundColor: 'black', color: 'white', padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
          Duda {currentIndex + 1} de {dudas.length}
        </span>
      </div>

      <div style={{ backgroundColor: 'white', border: '2px solid black', borderRadius: 'var(--radius-md)', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '4px 4px 0px black' }}>
        <p style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
          Tienes un cargo de <span style={{ color: 'var(--danger)' }}>${Math.abs(tx.amount).toLocaleString('es-CL')}</span> con esta descripción:
        </p>
        
        <div style={{ padding: '1rem', backgroundColor: '#f1f5f9', borderLeft: '4px solid black', fontFamily: 'monospace', fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 700 }}>
          {tx.description}
        </div>

        <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>
          Detecté la palabra "{currentDuda.matchedWord}".<br/>
          ¿Esta transferencia corresponde a tu contacto <span style={{ color: '#2563eb' }}>{currentDuda.contact.name}</span>?
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button 
          onClick={() => handleAccept(currentDuda)}
          className="btn" 
          style={{ flex: 1, minWidth: '200px', backgroundColor: 'var(--success)', color: 'white', fontSize: '1.125rem', padding: '1rem' }}
        >
          <Check size={24} />
          Sí, asociar siempre
        </button>
        <button 
          onClick={handleReject}
          className="btn btn-outline" 
          style={{ flex: 1, minWidth: '200px', fontSize: '1.125rem', padding: '1rem', backgroundColor: '#e2e8f0' }}
        >
          <X size={24} />
          No, ignorar
        </button>
      </div>
    </div>
  );
}
