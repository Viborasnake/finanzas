import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Edit2, Check, X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { extractAndNormalizeRUT } from '../utils/rutParser';
import type { ClassificationRule } from '../utils/classificationRules';
import { getRules, saveRules } from '../utils/classificationRules';
import { CascadingCategorySelector } from './Transactions';

export default function Settings() {
  const [categories, setCategories] = useState<any[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
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
      fetchCategories();
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

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim() || !user) return;
    
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert([{ name: newCategory.trim(), user_id: user.id }])
        .select();
        
      if (error) throw error;
      setCategories([...categories, data[0]]);
      setNewCategory('');
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      setCategories(categories.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const handleUpdateCategory = async (id: string) => {
    if (!editName.trim()) return;
    try {
      const { error } = await supabase
        .from('categories')
        .update({ name: editName.trim() })
        .eq('id', id);
      if (error) throw error;
      setCategories(categories.map(c => c.id === id ? { ...c, name: editName.trim() } : c));
      setEditingId(null);
    } catch (error) {
      console.error('Error updating category:', error);
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
        <div className="card">
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

        {/* Categorías Antiguas */}
        <div className="card" style={{ opacity: 0.7 }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Categorías Antiguas (Deprecated)</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Estas son las categorías de tu sistema antiguo. Se mantendrán por compatibilidad, pero el nuevo sistema usa la taxonomía de 3 niveles.
          </p>
          
          <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <input 
              type="text" 
              className="input" 
              placeholder="Nueva categoría..." 
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              <Plus size={20} />
              Agregar
            </button>
          </form>

          {loading ? (
            <p>Cargando categorías...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {categories.map(cat => (
                <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', border: '2px solid black', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-color)' }}>
                  {editingId === cat.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', flex: 1, marginRight: '1rem' }}>
                      <input
                        type="text"
                        className="input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateCategory(cat.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        style={{ padding: '0.5rem', flex: 1 }}
                      />
                      <button className="btn" style={{ padding: '0.5rem', backgroundColor: '#bbf7d0' }} onClick={() => handleUpdateCategory(cat.id)}>
                        <Check size={20} />
                      </button>
                      <button className="btn" style={{ padding: '0.5rem', backgroundColor: '#fecaca' }} onClick={() => setEditingId(null)}>
                        <X size={20} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600 }}>{cat.name}</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          className="btn" 
                          style={{ padding: '0.5rem', color: 'black', border: 'none', boxShadow: 'none' }}
                          onClick={() => {
                            setEditingId(cat.id);
                            setEditName(cat.name);
                          }}
                        >
                          <Edit2 size={20} />
                        </button>
                        <button 
                          className="btn" 
                          style={{ padding: '0.5rem', color: 'var(--danger)', border: 'none', boxShadow: 'none' }}
                          onClick={() => handleDeleteCategory(cat.id)}
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
