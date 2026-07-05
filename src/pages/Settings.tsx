import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { extractAndNormalizeRUT } from '../utils/rutParser';
import type { ClassificationRule } from '../utils/classificationRules';
import { applyRules } from '../utils/classificationRules';
import { CascadingCategorySelector } from './Transactions';
import { useSettings } from '../contexts/SettingsContext';
import { useBanks, AVAILABLE_BANKS } from '../contexts/BankContext';
import Tree from 'react-d3-tree';
import { useTaxonomy } from '../hooks/useTaxonomy';

const renderCustomNodeElement = ({ nodeDatum, toggleNode }: any) => {
  const isRoot = nodeDatum.name === 'Movimientos';
  const isIngreso = nodeDatum.name === 'Ingreso' || nodeDatum.name === 'Ingreso Real';
  const isEgreso = nodeDatum.name === 'Egreso' || nodeDatum.name === 'Egreso Real';
  const rootTipo = nodeDatum.attributes?.rootTipo;
  
  let fill = '#e2e8f0'; // default gray
  let stroke = '#94a3b8';
  if (isRoot) {
    fill = '#3b82f6'; // blue
    stroke = '#2563eb';
  } else if (isIngreso || rootTipo === 'Ingreso') {
    fill = '#dcfce7'; // pastel green
    stroke = '#22c55e';
    if (isIngreso) { fill = '#22c55e'; stroke = '#16a34a'; }
  } else if (isEgreso || rootTipo === 'Egreso') {
    fill = '#fee2e2'; // pastel red
    stroke = '#ef4444';
    if (isEgreso) { fill = '#ef4444'; stroke = '#dc2626'; }
  }

  return (
    <g>
      <circle r="12" fill={fill} stroke={stroke} strokeWidth="2" onClick={toggleNode} style={{ cursor: 'pointer' }} />
      <text 
        fill="black" 
        stroke="white"
        strokeWidth="6" 
        paintOrder="stroke fill"
        x="18" 
        y="-16" 
        style={{ 
          fontSize: isRoot || isIngreso || isEgreso ? '16px' : '14px', 
          fontWeight: isRoot || isIngreso || isEgreso ? 800 : 500,
          fontFamily: '"Inter", sans-serif'
        }}
      >
        {nodeDatum.name}
      </text>
    </g>
  );
};

function MindMap() {
  const { taxonomy } = useTaxonomy();
  const [zoom, setZoom] = useState(0.8);
  
  const treeData = {
    name: 'Movimientos',
    children: Object.entries(taxonomy)
      .filter(([tipo]) => tipo === 'Ingreso' || tipo === 'Egreso')
      .map(([tipo, principals]) => ({
      name: tipo,
      attributes: { rootTipo: tipo },
      children: Object.entries(principals as Record<string, string[]>).map(([principal, secundarias]) => ({
        name: principal,
        attributes: { rootTipo: tipo },
        children: secundarias.map(sec => ({ name: sec, attributes: { rootTipo: tipo } }))
      }))
    }))
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '500px', border: '2px solid black', borderRadius: '8px', background: 'white', overflow: 'hidden' }}>
      <Tree 
        data={treeData} 
        orientation="horizontal" 
        pathFunc="step" 
        translate={{ x: 100, y: 250 }} 
        nodeSize={{ x: 140, y: 35 }}
        zoomable={true}
        zoom={zoom}
        collapsible={true}
        separation={{ siblings: 1.2, nonSiblings: 1.5 }}
        renderCustomNodeElement={renderCustomNodeElement}
      />
      <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 10 }}>
        <button type="button" onClick={() => setZoom(z => Math.min(z + 0.2, 2))} style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '8px', padding: '0.5rem', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 900, cursor: 'pointer', boxShadow: '2px 2px 0px #000' }}>+</button>
        <button type="button" onClick={() => setZoom(z => Math.max(z - 0.2, 0.2))} style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '8px', padding: '0.5rem', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 900, cursor: 'pointer', boxShadow: '2px 2px 0px #000' }}>-</button>
      </div>
    </div>
  );
}

export default function Settings() {
  
  const { user } = useAuth();
  
  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirmDelete = window.confirm(
      "¿Estás 100% seguro de que deseas borrar tu cuenta? Esto eliminará PERMANENTEMENTE todas tus transacciones, configuraciones y reglas de categorización. Esta acción NO se puede deshacer."
    );
    if (!confirmDelete) return;

    try {
      toast.loading('Borrando datos de la cuenta...', { id: 'deleteAccount' });
      
      await supabase.from('transactions').delete().eq('user_id', user.id);
      await supabase.from('user_settings').delete().eq('user_id', user.id);
      await supabase.from('known_contacts').delete().eq('user_id', user.id);
      
      // Intentar borrar la cuenta auth si existe la función RPC
      try {
        await supabase.rpc('delete_user');
      } catch (e) {
        // ignore
      }
      
      toast.success('Cuenta eliminada exitosamente', { id: 'deleteAccount' });
      
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (error: any) {
      console.error('Error al borrar cuenta:', error);
      toast.error('Ocurrió un error al intentar borrar tu cuenta. Por favor contacta a soporte.', { id: 'deleteAccount' });
    }
  };

  // Settings
  const [myRut, setMyRut] = useState('');
  const [isSavingRut, setIsSavingRut] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRut, setNewContactRut] = useState('');
  
  const { customCategories, saveCustomCategories, classificationRules, saveClassificationRules } = useSettings();
  const { connectedBanks, mainBank, setMainBankAndSave, addBank, removeBank } = useBanks();
  
  const [newRuleKeyword, setNewRuleKeyword] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState<{ tipo: string | null, principal: string | null, secundaria: string | null }>({ tipo: null, principal: null, secundaria: null });
  const [newCatTipo, setNewCatTipo] = useState('Egreso');
  const [newCatPrincipal, setNewCatPrincipal] = useState('');
  const [newCatSecundaria, setNewCatSecundaria] = useState('');

  useEffect(() => {
    if (user) {
      fetchSettingsAndContacts();
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

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleKeyword.trim() || !newRuleCategory.tipo || !newRuleCategory.principal) {
      toast.error('Completa los campos de la regla');
      return;
    }
    const newRule: ClassificationRule = {
      id: crypto.randomUUID(),
      keyword: newRuleKeyword.trim(),
      tipo_movimiento: newRuleCategory.tipo,
      categoria_principal: newRuleCategory.principal!,
      categoria_secundaria: newRuleCategory.secundaria!
    };
    const updatedRules = [...classificationRules, newRule];
    await saveClassificationRules(updatedRules);
    setNewRuleKeyword('');
    setNewRuleCategory({ tipo: null, principal: null, secundaria: null });
    toast.success('Regla agregada');
  };

  const handleDeleteRule = async (id: string) => {
    const updatedRules = classificationRules.filter(r => r.id !== id);
    await saveClassificationRules(updatedRules);
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

  const handleAddCustomCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatPrincipal.trim() || !newCatSecundaria.trim()) {
      toast.error('Completa los nombres de la categoría principal y secundaria.');
      return;
    }
    
    const catsCopy = [...customCategories];
    const principalStr = newCatPrincipal.trim();
    const secStr = newCatSecundaria.trim();
    
    const existingIdx = catsCopy.findIndex(c => c.tipo === newCatTipo && c.principal === principalStr);
    
    if (existingIdx >= 0) {
      if (!catsCopy[existingIdx].secundarias.includes(secStr)) {
        catsCopy[existingIdx].secundarias.push(secStr);
      } else {
        toast.error('Esa categoría secundaria ya existe bajo esa principal.');
        return;
      }
    } else {
      catsCopy.push({
        tipo: newCatTipo,
        principal: principalStr,
        secundarias: [secStr]
      });
    }

    await saveCustomCategories(catsCopy);
    setNewCatSecundaria('');
    toast.success('Categoría agregada');
  };

  const handleDeleteCustomSecundaria = async (tipo: string, principal: string, secIndex: number) => {
    const catsCopy = [...customCategories];
    const existingIdx = catsCopy.findIndex(c => c.tipo === tipo && c.principal === principal);
    if (existingIdx >= 0) {
      catsCopy[existingIdx].secundarias.splice(secIndex, 1);
      if (catsCopy[existingIdx].secundarias.length === 0) {
        catsCopy.splice(existingIdx, 1);
      }
      await saveCustomCategories(catsCopy);
      toast.success('Categoría eliminada');
    }
  };


  return (
    <div>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>Configuración</h1>
      
      <div className="card" style={{ marginBottom: '2rem', maxWidth: '800px' }}>
        <h2 id="mapa-mental" style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Mapa Mental de Categorías</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
          Visualiza cómo están interconectadas tus categorías de Ingresos y Egresos. Puedes arrastrar para moverte y hacer clic en los nodos para expandir/colapsar.
        </p>
        <MindMap />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', maxWidth: '800px' }}>
        
        {/* Identificación (RUT) */}
        <div className="card">
          <h2 id="deteccion" style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Detección Automática (Tu RUT)</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Ingresa tu RUT para que el sistema reconozca automáticamente las transferencias entre tus propias cuentas y no las sume como Egreso o Ingreso.
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
                      tipo = 'Egreso'; principal = 'Transferencias a Otras Personas'; secundaria = 'Familiares';
                    }
                  }
                  
                  if (!tipo) {
                    const match = applyRules(desc, classificationRules);
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
              Auto-clasificar pendientes
            </button>
          </div>
        </div>

        {/* Categorías Personalizadas */}
        <div className="card">
          <h2 id="categorias" style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Mis Categorías (Personalizadas)</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Agrega nuevas categorías para organizar tus movimientos. Estas se sumarán a la lista base que ya trae la aplicación.
          </p>

          <form onSubmit={handleAddCustomCategory} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '1rem', alignItems: 'end', marginBottom: '2rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, fontSize: '0.85rem' }}>Tipo de Movimiento</label>
              <select className="input" value={newCatTipo} onChange={(e) => setNewCatTipo(e.target.value)} style={{ width: '100%', padding: '0.5rem' }}>
                <option value="Egreso">Egreso</option>
                <option value="Ingreso">Ingreso</option>
                <option value="Ahorro/Inversión">Ahorro / Inversión</option>
                <option value="Movimiento Interno">Movimiento Interno</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, fontSize: '0.85rem' }}>Categoría Principal</label>
              <input type="text" className="input" placeholder="Ej: Mis Mascotas" value={newCatPrincipal} onChange={(e) => setNewCatPrincipal(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, fontSize: '0.85rem' }}>Subcategoría (Detalle)</label>
              <input type="text" className="input" placeholder="Ej: Juguetes" value={newCatSecundaria} onChange={(e) => setNewCatSecundaria(e.target.value)} style={{ width: '100%' }} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem' }}>
              <Plus size={20} />
              Añadir
            </button>
          </form>

          {customCategories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {customCategories.map((cat, i) => (
                <div key={i} style={{ padding: '1rem', border: '2px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <span style={{ backgroundColor: '#000', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '0.25rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                      {cat.tipo}
                    </span>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{cat.principal}</h3>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {cat.secundarias.map((sec, secIdx) => (
                      <div key={secIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#fff', border: '1.5px solid #cbd5e1', padding: '0.35rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600 }}>
                        {sec}
                        <button 
                          onClick={() => handleDeleteCustomSecundaria(cat.tipo, cat.principal, secIdx)} 
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: '#ef4444', padding: 0 }}
                          title="Eliminar subcategoría"
                        >
                          <X size={14} strokeWidth={3} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', border: '2px dashed #cbd5e1', borderRadius: '8px' }}>
              <p style={{ margin: 0, color: '#64748b', fontWeight: 600 }}>No has creado categorías personalizadas aún.</p>
            </div>
          )}
        </div>

        {/* Contactos Frecuentes */}
        <div className="card">
          <h2 id="contactos" style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Contactos Conocidos</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Agrega RUTs de amigos o familiares. Cuando importes, el sistema clasificará automáticamente los traspasos a ellos como "Transferencias a Otras Personas".
          </p>
          
          <form className="flex-stack" onSubmit={handleAddContact} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
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
          <h2 id="reglas" style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Reglas de Auto-Clasificación (Mapeo)</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Define qué texto debe estar en la glosa (descripción) de una transacción para asignarle automáticamente una categoría. Las reglas se aplican al importar.
          </p>
          
          <form className="flex-stack" onSubmit={handleAddRule} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
            {classificationRules.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No hay reglas de clasificación configuradas.</p>
            ) : (
              classificationRules.map(r => (
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

        {/* Bank Management */}
        <div className="card" style={{ position: 'relative', zIndex: 9 }}>
          <h2 id="bancos" style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Mis Bancos</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Administra los bancos que tienes conectados y define cuál es el banco principal para tus reportes globales.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
            {connectedBanks.map(bankId => {
              const bank = AVAILABLE_BANKS.find(b => b.id === bankId);
              if (!bank) return null;
              const isMain = bank.id === mainBank;
              return (
                <div key={bank.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '2px solid black', borderRadius: '8px', backgroundColor: 'var(--bg-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>{bank.emoji}</span>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{bank.label}</span>
                    {isMain && (
                      <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', backgroundColor: '#fef08a', color: '#854d0e', borderRadius: '999px', fontWeight: 900, border: '2px solid #000' }}>
                        BANCO PRINCIPAL
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {!isMain && (
                      <button 
                        className="btn btn-outline" 
                        onClick={() => setMainBankAndSave(bank.id)}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                      >
                        Establecer Principal
                      </button>
                    )}
                    {connectedBanks.length > 1 && (
                      <button 
                        className="btn" 
                        onClick={() => removeBank(bank.id)}
                        style={{ padding: '0.5rem', backgroundColor: '#fee2e2', color: 'var(--danger)', border: '2px solid var(--danger)' }}
                        title="Desconectar banco"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 700 }}>Agregar Nuevo Banco</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {AVAILABLE_BANKS.filter(b => !connectedBanks.includes(b.id)).map(bank => (
              <button
                key={bank.id}
                onClick={() => addBank(bank.id)}
                className="btn btn-outline"
                style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1', minWidth: '150px' }}
              >
                <Plus size={16} />
                {bank.emoji} {bank.label}
              </button>
            ))}
            {AVAILABLE_BANKS.filter(b => !connectedBanks.includes(b.id)).length === 0 && (
              <p style={{ color: 'var(--text-secondary)' }}>Ya tienes todos los bancos disponibles conectados.</p>
            )}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="card" style={{ position: 'relative', zIndex: 10, borderColor: 'var(--danger)' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: 'var(--danger)' }}>Zona Peligrosa</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Borrar tu cuenta eliminará de forma irreversible todas tus transacciones, configuraciones y reglas guardadas. Esta acción no se puede deshacer.
          </p>
          <button 
            className="btn" 
            style={{ backgroundColor: '#fecaca', color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={handleDeleteAccount}
          >
            <Trash2 size={20} />
            Borrar Cuenta Definitivamente
          </button>
        </div>

      </div>
    </div>
  );
}
