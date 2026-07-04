import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { extractAndNormalizeRUT } from '../utils/rutParser';
import type { ClassificationRule } from '../utils/classificationRules';
import { getRules, saveRules, applyRules } from '../utils/classificationRules';
import { CascadingCategorySelector } from './Transactions';

export default function Settings() {
  
  const { user } = useAuth();

  // Settings
  const [myRut, setMyRut] = useState('');
  const [isSavingRut, setIsSavingRut] = useState(false);

  // Contacts
  const [contacts, setContacts] = useState<any[]>([]);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRut, setNewContactRut] = useState('');

  // Rules
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [newRuleKeyword, setNewRuleKeyword] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState<{ tipo: string | null, principal: string | null, secundaria: string | null }>({ tipo: null, principal: null, secundaria: null });

  useEffect(() => {
    if (user) {

      fetchSettingsAndContacts();
      setRules(getRules());
    }
  }, [user]);

  const fetchSettingsAndContacts = async () => {
    try {
      const [{ data: s }, { data: c }] = await Promise.all([
        supabase.from('user_settings').select('*').eq('user_id', user!.id).maybeSingle(),
        supabase.from('known_contacts').select('*').eq('user_id', user!.id)
      ]);
      if (s && s.rut) setMyRut(s.rut);
      if (c) setContacts(c);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveRut = async () => {
    if (!user) return;
    const normalized = extractAndNormalizeRUT(myRut);
    if (!normalized) {
      toast.error('RUT inválido. Verifica el formato.');
      return;
    }
    
    setIsSavingRut(true);
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, rut: normalized }, { onConflict: 'user_id' });
      if (error) throw error;
      setMyRut(normalized);
      toast.success('RUT guardado exitosamente.');
    } catch (e) {
      console.error(e);
      toast.error('Error guardando el RUT.');
    } finally {
      setIsSavingRut(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !user) return;
    
    const normalizedRut = newContactRut ? extractAndNormalizeRUT(newContactRut) : null;
    
    try {
      const { data, error } = await supabase
        .from('known_contacts')
        .insert([{ name: newContactName.trim(), rut: normalizedRut, user_id: user.id }])
        .select();
        
      if (error) throw error;
      setContacts([...contacts, data[0]]);
      setNewContactName('');
      setNewContactRut('');
      toast.success('Contacto agregado');
    } catch (error) {
      console.error('Error adding contact:', error);
      toast.error('Error al eliminar contacto');
    }
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleKeyword.trim() || !newRuleCategory.tipo) {
      toast.error('Ingresa una palabra clave y selecciona una categoría.');
      return;
    }
    const newRule: ClassificationRule = {
      id: crypto.randomUUID(),
      keyword: newRuleKeyword.trim(),
      tipo_movimiento: newRuleCategory.tipo,
      categoria_principal: newRuleCategory.principal!,
      categoria_secundaria: newRuleCategory.secundaria!
    };
    const updatedRules = [...rules, newRule];
    setRules(updatedRules);
    saveRules(updatedRules);
    setNewRuleKeyword('');
    setNewRuleCategory({ tipo: null, principal: null, secundaria: null });
    toast.success('Regla agregada');
  };

  const handleDeleteRule = (id: string) => {
    const updatedRules = rules.filter(r => r.id !== id);
    setRules(updatedRules);
    saveRules(updatedRules);
    toast.success('Regla eliminada');
  };

  const handleDeleteContact = async (id: string) => {
    try {
      const { error } = await supabase
        .from('known_contacts')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      setContacts(contacts.filter(c => c.id !== id));
      toast.success('Contacto eliminado');
    } catch (error) {
      console.error('Error deleting contact:', error);
    }
  };


  return (
    <div>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>Configuración</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', maxWidth: '800px' }}>
        
        {/* Identificación (RUT) */}
        <div className="card">
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Detección Automática (Tu RUT)</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Ingresa tu RUT para que el sistema reconozca automáticamente las transferencias entre tus propias cuentas y no las sume como Gasto o Ingreso Real.
          </p>
          
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <input 
              type="text" 
              className="input" 
              placeholder="Ej: 16.424.491-1" 
              value={myRut}
              onChange={(e) => setMyRut(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleSaveRut} disabled={isSavingRut}>
              <Save size={20} />
              Guardar RUT
            </button>
          </div>

          <div style={{ borderTop: '2px solid #e2e8f0', margin: '1.5rem 0', paddingTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 800 }}>¿Tienes transacciones antiguas sin clasificar?</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 500 }}>
              Si importaste datos antes de guardar tu RUT o tus reglas, puedes aplicar la auto-clasificación a todo tu historial pendiente.
            </p>
            <button className="btn btn-outline" onClick={async () => {
              if (!user) return;
              toast.loading('Escaneando transacciones...', { id: 'rescan' });
              try {
                // 1. Obtener pendientes
                const { data: txs, error: fetchErr } = await supabase.from('transactions').select('id, raw_data, description').eq('user_id', user.id).is('tipo_movimiento', null);
                if (fetchErr) throw fetchErr;
                if (!txs || txs.length === 0) {
                  toast.success('No hay transacciones pendientes.', { id: 'rescan' });
                  return;
                }

                let updated = 0;
                for (const tx of txs) {
                  const rawDescKey = tx.raw_data ? Object.keys(tx.raw_data).find(k => k.toLowerCase().includes('descripc')) || '' : '';
                  const rawDesc = tx.raw_data && rawDescKey ? tx.raw_data[rawDescKey] : '';
                  const desc = (rawDesc || tx.description || '').toLowerCase();
                  let tipo = null, principal = null, secundaria = null;
                  
                  const rutEx = extractAndNormalizeRUT(desc);
                  const my = myRut ? extractAndNormalizeRUT(myRut) : null;
                  
                  if (rutEx && my && rutEx === my) {
                    tipo = 'Movimiento Interno';
                    principal = desc.includes('fondo') ? 'Traspaso fondo' : 'Transferencia personal';
                    secundaria = principal;
                  } else {
                    const c = contacts.find(c => {
                      if (rutEx && c.rut && extractAndNormalizeRUT(c.rut) === rutEx) return true;
                      if (c.name && desc.includes(c.name.toLowerCase())) return true;
                      return false;
                    });
                    if (c) {
                      tipo = 'Gasto Real'; principal = 'Pago a Familiar'; secundaria = 'Pago a Familiar';
                    }
                  }
                  
                  // Falta applyRules, pero para simplificar (ya que la función aplica todo):
                  if (!tipo) {
                    const match = applyRules(desc);
                    if (match) {
                      tipo = match.tipo_movimiento;
                      principal = match.categoria_principal;
                      secundaria = match.categoria_secundaria;
                    }
                  }

                  if (tipo) {
                    await supabase.from('transactions').update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria }).eq('id', tx.id);
                    updated++;
                  }
                }
                toast.success(`Se auto-clasificaron ${updated} transacciones.`, { id: 'rescan' });
              } catch (e: any) {
                toast.error('Error al escanear: ' + e.message, { id: 'rescan' });
              }
            }}>
              Re-escanear transacciones pendientes
            </button>
          </div>
        </div>

        {/* Contactos Frecuentes */}
        <div className="card">
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Contactos Conocidos</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Agrega RUTs de amigos o familiares. Cuando importes, el sistema clasificará automáticamente los traspasos a ellos como "Pago a Familiar".
          </p>
          
          <form onSubmit={handleAddContact} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <input 
              type="text" 
              className="input" 
              placeholder="Nombre (ej. Juan)" 
              value={newContactName}
              onChange={(e) => setNewContactName(e.target.value)}
              required
            />
            <input 
              type="text" 
              className="input" 
              placeholder="RUT (opcional)" 
              value={newContactRut}
              onChange={(e) => setNewContactRut(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              <Plus size={20} />
              Agregar
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {contacts.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No hay contactos guardados.</p>
            ) : (
              contacts.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', border: '2px solid black', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-color)' }}>
                  <div>
                    <span style={{ fontWeight: 600, display: 'block' }}>{c.name}</span>
                    {c.rut && <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>RUT: {c.rut}</span>}
                  </div>
                  <button 
                    className="btn" 
                    style={{ padding: '0.5rem', color: 'var(--danger)', border: 'none', boxShadow: 'none' }}
                    onClick={() => handleDeleteContact(c.id)}
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Classification Rules */}
        <div className="card" style={{ position: 'relative', zIndex: 10 }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Reglas de Auto-Clasificación (Mapeo)</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Define qué texto debe estar en la glosa (descripción) de una transacción para asignarle automáticamente una categoría. Las reglas se aplican al importar.
          </p>
          
          <form onSubmit={handleAddRule} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input 
              type="text" 
              className="input" 
              placeholder="Palabra clave (ej. SODIMAC)" 
              value={newRuleKeyword}
              onChange={(e) => setNewRuleKeyword(e.target.value)}
              required
              style={{ flex: 1, minWidth: '200px' }}
            />
            <CascadingCategorySelector 
              initialPrincipal={null} 
              initialSecundaria={null} 
              onSave={(t: any, p: any, s: any) => setNewRuleCategory({ tipo: t, principal: p, secundaria: s })} 
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
              <Plus size={20} />
              Crear Regla
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {rules.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No hay reglas de clasificación configuradas.</p>
            ) : (
              rules.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', border: '2px solid black', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-color)' }}>
                  <div>
                    <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>Si contiene: "{r.keyword}"</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Clasificar como: {r.tipo_movimiento} &gt; {r.categoria_principal} &gt; {r.categoria_secundaria}
                    </span>
                  </div>
                  <button 
                    className="btn" 
                    style={{ padding: '0.5rem', color: 'var(--danger)', border: 'none', boxShadow: 'none' }}
                    onClick={() => handleDeleteRule(r.id)}
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>



      </div>
    </div>
  );
}
