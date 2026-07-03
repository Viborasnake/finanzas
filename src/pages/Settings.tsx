import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2 } from 'lucide-react';

export default function Settings() {
  const [categories, setCategories] = useState<any[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchCategories();
    }
  }, [user]);

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

  return (
    <div>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>Configuración</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', maxWidth: '800px' }}>
        
        {/* Categorías */}
        <div className="card">
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Tus Categorías</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Crea categorías personalizadas para organizar tus transacciones (Ej: Supermercado, Bencina, Arriendo).
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
              {categories.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No has creado categorías aún.</p>
              ) : (
                categories.map(cat => (
                  <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '2px solid black', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-color)' }}>
                    <span style={{ fontWeight: 600 }}>{cat.name}</span>
                    <button 
                      className="btn" 
                      style={{ padding: '0.5rem', color: 'var(--danger)', border: 'none', boxShadow: 'none' }}
                      onClick={() => handleDeleteCategory(cat.id)}
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Permisos */}
        <div className="card">
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Cuentas Compartidas</h2>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '1.5rem' }}>
            Próximamente: Aquí podrás invitar a tu esposa u otros perfiles para que vean y administren los gastos contigo.
          </p>
          <button className="btn btn-outline" disabled style={{ opacity: 0.5 }}>
            Invitar Usuario
          </button>
        </div>

      </div>
    </div>
  );
}
