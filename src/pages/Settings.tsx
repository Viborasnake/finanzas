import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Save, X, BadgeCheck, Landmark, Tags, Users, Wand2, CalendarCheck, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { extractAndNormalizeRUT } from '../utils/rutParser';
import type { ClassificationRule } from '../utils/classificationRules';
import { applyRules } from '../utils/classificationRules';
import { CascadingCategorySelector } from './Transactions';
import { useSettings } from '../contexts/SettingsContext';
import { useBanks, AVAILABLE_BANKS } from '../contexts/BankContext';
import { InitialAdjustmentManager } from '../components/InitialAdjustmentManager';
import type { FixedExpense } from '../contexts/SettingsContext';

const SUGGESTED_FIXED_EXPENSES = [
  'Luz',
  'Agua',
  'Gas',
  'Internet hogar',
  'GPT',
  'Apple Music',
  'HBO Max',
  'iCloud',
  'Gemini',
  'Dividendo',
  'CAE (Crédito con aval del estado)',
  'Seguro Auto (Falabella)'
];


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
  
  const { customCategories, saveCustomCategories, classificationRules, saveClassificationRules, fixedExpenses, saveFixedExpenses } = useSettings();
  const { connectedBanks, mainBank, setMainBankAndSave, addBank, removeBank } = useBanks();
  
  const [newRuleKeyword, setNewRuleKeyword] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState<{ tipo: string | null, principal: string | null, secundaria: string | null }>({ tipo: null, principal: null, secundaria: null });
  const [newCatTipo, setNewCatTipo] = useState('Egreso');
  const [newCatPrincipal, setNewCatPrincipal] = useState('');
  const [newCatSecundaria, setNewCatSecundaria] = useState('');
  const [newFixedName, setNewFixedName] = useState('');
  const [newFixedKeyword, setNewFixedKeyword] = useState('');
  const [newFixedCategory, setNewFixedCategory] = useState<{ tipo: string | null, principal: string | null, secundaria: string | null }>({ tipo: null, principal: null, secundaria: null });
  const [editingFixedId, setEditingFixedId] = useState<string | null>(null);
  const [editFixedName, setEditFixedName] = useState('');
  const [editFixedKeyword, setEditFixedKeyword] = useState('');
  const [editFixedCategory, setEditFixedCategory] = useState<{ tipo: string | null, principal: string | null, secundaria: string | null }>({ tipo: null, principal: null, secundaria: null });

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

  const handleAddFixedExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFixedName.trim()) {
      toast.error('Ponle un nombre al gasto fijo');
      return;
    }

    const item: FixedExpense = {
      id: crypto.randomUUID(),
      name: newFixedName.trim(),
      tipo_movimiento: newFixedCategory.tipo || 'Egreso',
      categoria_principal: newFixedCategory.principal,
      categoria_secundaria: newFixedCategory.secundaria,
      keyword: newFixedKeyword.trim() || undefined
    };

    await saveFixedExpenses([...fixedExpenses, item]);
    setNewFixedName('');
    setNewFixedKeyword('');
    setNewFixedCategory({ tipo: null, principal: null, secundaria: null });
    toast.success('Gasto fijo agregado');
  };

  const handleDeleteFixedExpense = async (id: string) => {
    await saveFixedExpenses(fixedExpenses.filter(item => item.id !== id));
    toast.success('Gasto fijo eliminado');
  };

  const startEditFixedExpense = (item: FixedExpense) => {
    setEditingFixedId(item.id);
    setEditFixedName(item.name);
    setEditFixedKeyword(item.keyword || '');
    setEditFixedCategory({
      tipo: item.tipo_movimiento || 'Egreso',
      principal: item.categoria_principal || null,
      secundaria: item.categoria_secundaria || null
    });
  };

  const cancelEditFixedExpense = () => {
    setEditingFixedId(null);
    setEditFixedName('');
    setEditFixedKeyword('');
    setEditFixedCategory({ tipo: null, principal: null, secundaria: null });
  };

  const handleSaveFixedExpense = async (id: string) => {
    if (!editFixedName.trim()) {
      toast.error('Ponle un nombre al gasto fijo');
      return;
    }

    const next = fixedExpenses.map(item => item.id === id
      ? {
          ...item,
          name: editFixedName.trim(),
          tipo_movimiento: editFixedCategory.tipo || 'Egreso',
          categoria_principal: editFixedCategory.principal,
          categoria_secundaria: editFixedCategory.secundaria,
          keyword: editFixedKeyword.trim() || undefined
        }
      : item
    );

    await saveFixedExpenses(next);
    cancelEditFixedExpense();
    toast.success('Gasto fijo actualizado');
  };

  const handleLoadSuggestedFixedExpenses = async () => {
    const existing = new Set(fixedExpenses.map(item => item.name.toLowerCase()));
    const next = [
      ...fixedExpenses,
      ...SUGGESTED_FIXED_EXPENSES
        .filter(name => !existing.has(name.toLowerCase()))
        .map(name => ({
          id: crypto.randomUUID(),
          name,
          tipo_movimiento: 'Egreso',
          categoria_principal: null,
          categoria_secundaria: null,
          keyword: name
        }))
    ];

    await saveFixedExpenses(next);
    toast.success('Gastos fijos sugeridos cargados');
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
    <div className="settings-page">
      <div className="settings-hero">
        <div>
          <span className="settings-kicker">Centro de control</span>
          <h1>Configuración</h1>
          <p>Define cómo MisFinanzas reconoce bancos, personas, reglas y categorías para clasificar mejor tus movimientos.</p>
        </div>
        <div className="settings-stats">
          <a href="#bancos"><Landmark size={18} /> {connectedBanks.length} bancos</a>
          <a href="#contactos"><Users size={18} /> {contacts.length} contactos</a>
          <a href="#categorias"><Tags size={18} /> {customCategories.length} categorías</a>
          <a href="#gastos-fijos"><CalendarCheck size={18} /> {fixedExpenses.length} fijos</a>
          <a href="#reglas"><Wand2 size={18} /> {classificationRules.length} reglas</a>
        </div>
      </div>

      <div className="settings-quick-links">
        <a href="#bancos">Bancos</a>
        <a href="#ajuste">Saldo inicial</a>
        <a href="#deteccion">RUT</a>
        <a href="#contactos">Contactos</a>
        <a href="#categorias">Categorías</a>
        <a href="#gastos-fijos">Gastos fijos</a>
        <a href="#reglas">Reglas</a>
      </div>

      <div className="settings-bento">
        {/* Bank Management */}
        <div className="card settings-card settings-card-wide" style={{ position: 'relative', zIndex: 9 }}>
          <div className="settings-section-title">
            <Landmark size={26} />
            <div>
              <h2 id="bancos">Mis Bancos</h2>
              <span>Primero elige con qué banco vas a trabajar</span>
            </div>
          </div>
          <p className="settings-muted">
            Administra los bancos que tienes conectados y define cuál es el banco principal para tus reportes globales.
          </p>
          
          <div className="settings-list compact" style={{ marginBottom: '1.5rem' }}>
            {connectedBanks.map(bankId => {
              const bank = AVAILABLE_BANKS.find(b => b.id === bankId);
              if (!bank) return null;
              const isMain = bank.id === mainBank;
              return (
                <div key={bank.id} className="settings-list-row bank-row">
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

          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 800 }}>Agregar Nuevo Banco</h3>
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

        {/* Ajuste de Inicio */}
        <div id="ajuste" className="settings-card-wide settings-anchor">
          <InitialAdjustmentManager />
        </div>
        
        {/* Identificación (RUT) */}
        <div className="card settings-card settings-card-wide">
          <div className="settings-section-title">
            <BadgeCheck size={26} />
            <div>
              <h2 id="deteccion">Detección Automática</h2>
              <span>Tu RUT y auto-clasificación histórica</span>
            </div>
          </div>
          <p className="settings-muted">
            Ingresa tu RUT para que el sistema reconozca automáticamente las transferencias entre tus propias cuentas y no las sume como Egreso o Ingreso.
          </p>
          
          <div className="settings-inline-form">
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

          <div className="settings-callout">
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
        <div className="card settings-card settings-card-wide">
          <div className="settings-section-title">
            <Tags size={26} />
            <div>
              <h2 id="categorias">Mis Categorías</h2>
              <span>Categorías personalizadas para este banco</span>
            </div>
          </div>
          <p className="settings-muted">
            Agrega nuevas categorías para organizar tus movimientos. Estas se sumarán a la lista base que ya trae la aplicación.
          </p>

          <form className="settings-grid-form" onSubmit={handleAddCustomCategory}>
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
            <div className="settings-list">
              {customCategories.map((cat, i) => (
                <div key={i} className="settings-list-item">
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
            <div className="settings-empty">
              <p style={{ margin: 0, color: '#64748b', fontWeight: 600 }}>No has creado categorías personalizadas aún.</p>
            </div>
          )}
        </div>

        {/* Gastos Fijos */}
        <div className="card settings-card settings-card-wide">
          <div className="settings-section-title">
            <CalendarCheck size={26} />
            <div>
              <h2 id="gastos-fijos">Gastos Fijos</h2>
              <span>Cuentas recurrentes para controlar pagos mensuales</span>
            </div>
          </div>
          <p className="settings-muted">
            Crea tus cuentas fijas y vincúlalas a una categoría. El dashboard las cruzará con tus movimientos para mostrar qué está pagado y qué falta.
          </p>

          {fixedExpenses.length === 0 && (
            <div className="settings-callout" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0, marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem', fontWeight: 900 }}>Partir rápido con tus cuentas</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 600 }}>
                Carga Luz, Agua, Gas, Internet hogar, suscripciones, Dividendo, CAE y Seguro Auto. Luego ajustas el vínculo de categoría de cada una.
              </p>
              <button className="btn btn-outline" onClick={handleLoadSuggestedFixedExpenses} type="button">
                <Plus size={18} />
                Cargar sugeridos
              </button>
            </div>
          )}

          <form className="settings-fixed-expense-form" onSubmit={handleAddFixedExpense}>
            <input
              type="text"
              className="input"
              placeholder="Nombre (ej. Luz, CAE, HBO Max)"
              value={newFixedName}
              onChange={(e) => setNewFixedName(e.target.value)}
              required
            />
            <input
              type="text"
              className="input"
              placeholder="Palabra opcional (ej. Enel, Falabella)"
              value={newFixedKeyword}
              onChange={(e) => setNewFixedKeyword(e.target.value)}
            />
            <div className="settings-rule-category">
              <CascadingCategorySelector
                initialPrincipal={null}
                initialSecundaria={null}
                onSave={(t: any, p: any, s: any) => setNewFixedCategory({ tipo: t, principal: p, secundaria: s })}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              <Plus size={20} />
              Agregar fijo
            </button>
          </form>

          <div className="settings-list compact">
            {fixedExpenses.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Aún no tienes gastos fijos configurados.</p>
            ) : (
              fixedExpenses.map(item => (
                <div key={item.id} className="settings-list-row">
                  {editingFixedId === item.id ? (
                    <div className="settings-fixed-expense-edit">
                      <input
                        type="text"
                        className="input"
                        value={editFixedName}
                        onChange={(e) => setEditFixedName(e.target.value)}
                        placeholder="Nombre"
                      />
                      <input
                        type="text"
                        className="input"
                        value={editFixedKeyword}
                        onChange={(e) => setEditFixedKeyword(e.target.value)}
                        placeholder="Palabra opcional"
                      />
                      <div className="settings-rule-category">
                        <CascadingCategorySelector
                          initialPrincipal={editFixedCategory.principal}
                          initialSecundaria={editFixedCategory.secundaria}
                          onSave={(t: any, p: any, s: any) => setEditFixedCategory({ tipo: t, principal: p, secundaria: s })}
                        />
                      </div>
                      <div className="settings-row-actions">
                        <button
                          className="btn btn-primary"
                          onClick={() => handleSaveFixedExpense(item.id)}
                          type="button"
                        >
                          <Save size={18} />
                          Guardar
                        </button>
                        <button
                          className="btn btn-outline"
                          onClick={cancelEditFixedExpense}
                          type="button"
                        >
                          <X size={18} />
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 900, display: 'block', marginBottom: '0.25rem' }}>{item.name}</span>
                        <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: 650 }}>
                          {item.categoria_principal
                            ? `${item.tipo_movimiento || 'Egreso'} > ${item.categoria_principal}${item.categoria_secundaria ? ` > ${item.categoria_secundaria}` : ''}`
                            : 'Falta vincular categoría'}
                          {item.keyword ? ` · "${item.keyword}"` : ''}
                        </span>
                      </div>
                      <div className="settings-row-actions">
                        <button
                          className="btn btn-outline"
                          onClick={() => startEditFixedExpense(item)}
                          type="button"
                          title="Editar gasto fijo"
                        >
                          <Pencil size={18} />
                          Editar
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '0.5rem', color: 'var(--danger)', border: 'none', boxShadow: 'none' }}
                          onClick={() => handleDeleteFixedExpense(item.id)}
                          type="button"
                          title="Eliminar gasto fijo"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Contactos Frecuentes */}
        <div className="card settings-card">
          <div className="settings-section-title">
            <Users size={26} />
            <div>
              <h2 id="contactos">Contactos Conocidos</h2>
              <span>Personas frecuentes para transferencias</span>
            </div>
          </div>
          <p className="settings-muted">
            Agrega RUTs de amigos o familiares. Cuando importes, el sistema clasificará automáticamente los traspasos a ellos como "Transferencias a Otras Personas".
          </p>
          
          <form className="settings-stack-form" onSubmit={handleAddContact}>
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

          <div className="settings-list compact">
            {contacts.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No hay contactos guardados.</p>
            ) : (
              contacts.map(c => (
                <div key={c.id} className="settings-list-row">
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
        <div className="card settings-card settings-card-tall" style={{ position: 'relative', zIndex: 10 }}>
          <div className="settings-section-title">
            <Wand2 size={26} />
            <div>
              <h2 id="reglas">Reglas de Auto-Clasificación</h2>
              <span>Mapeo persistente por palabra clave</span>
            </div>
          </div>
          <p className="settings-muted">
            Define qué texto debe estar en la glosa (descripción) de una transacción para asignarle automáticamente una categoría. Las reglas se aplican al importar.
          </p>
          
          <form className="settings-rule-form" onSubmit={handleAddRule}>
            <input 
              type="text" 
              className="input" 
              placeholder="Palabra clave (ej. SODIMAC)" 
              value={newRuleKeyword}
              onChange={(e) => setNewRuleKeyword(e.target.value)}
              required
            />
            <div className="settings-rule-category">
            <CascadingCategorySelector 
              initialPrincipal={null} 
              initialSecundaria={null} 
              onSave={(t: any, p: any, s: any) => setNewRuleCategory({ tipo: t, principal: p, secundaria: s })} 
            />
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
              <Plus size={20} />
              Crear Regla
            </button>
          </form>

          <div className="settings-list compact">
            {classificationRules.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No hay reglas de clasificación configuradas.</p>
            ) : (
              classificationRules.map(r => (
                <div key={r.id} className="settings-list-row">
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

        {/* Danger Zone */}
        <div className="card settings-card settings-card-wide settings-danger" style={{ position: 'relative', zIndex: 10, borderColor: 'var(--danger)' }}>
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
