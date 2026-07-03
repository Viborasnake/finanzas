import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');

  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchTransactions();
    }
  }, [user]);

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, category:categories(id, name, color)')
        .eq('user_id', user?.id)
        .order('date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Error al cargar transacciones');
    } finally {
      setLoading(false);
    }
  };

  const [categories, setCategories] = useState<any[]>([]);
  useEffect(() => {
    if (user) {
      fetchCategories();
    }
  }, [user]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (!error && data) setCategories(data);
    } catch (err) {}
  };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const availableYears = useMemo(() => {
    const years = new Set(transactions.map(t => new Date(t.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || t.type === filterType;
    
    const date = new Date(t.date);
    const matchesYear = filterYear === 'all' || date.getFullYear().toString() === filterYear;
    const matchesMonth = filterMonth === 'all' || (date.getMonth() + 1).toString() === filterMonth;

    return matchesSearch && matchesType && matchesYear && matchesMonth;
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage, 
    currentPage * itemsPerPage
  );

  const handleDescriptionChange = (id: string, newDesc: string) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, description: newDesc } : t));
  };

  const handleDescriptionBlur = async (id: string, currentDesc: string, rawDesc: string) => {
    const originalTx = transactions.find(t => t.id === id);
    if (!originalTx || originalTx.description.trim() === '') return;

    const othersCount = transactions.filter(t => t.id !== id && t.raw_data && t.raw_data[Object.keys(t.raw_data).find(k => k.toLowerCase().includes('descripc')) || ''] === rawDesc && t.description !== currentDesc).length;

    if (othersCount > 0) {
      toast.custom((t) => (
        <div className="card" style={{ padding: '1.5rem', border: '2px solid black', boxShadow: '4px 4px 0px black', background: 'white', maxWidth: '400px' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.125rem' }}>Renombrado Múltiple</h3>
          <p style={{ margin: '0.5rem 0 1.5rem' }}>
            Hay otras {othersCount} transacciones que originalmente se llamaban igual. ¿Quieres aplicar el alias "{currentDesc}" a todas ellas también?
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button 
              className="btn btn-outline" 
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} 
              onClick={async () => {
                toast.dismiss(t.id);
                const { error } = await supabase.from('transactions').update({ description: currentDesc }).eq('id', id);
                if (error) toast.error("Error al actualizar");
                else toast.success("Alias actualizado");
              }}
            >
              Solo a esta
            </button>
            <button 
              className="btn btn-primary" 
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} 
              onClick={async () => {
                toast.dismiss(t.id);
                
                const descKey = Object.keys(originalTx.raw_data).find(k => k.toLowerCase().includes('descripc')) || '';
                
                setTransactions(prev => prev.map(tx => {
                  if (tx.raw_data && tx.raw_data[descKey] === rawDesc) {
                    return { ...tx, description: currentDesc };
                  }
                  return tx;
                }));

                const { error } = await supabase
                  .from('transactions')
                  .update({ description: currentDesc })
                  .eq('user_id', user?.id)
                  .contains('raw_data', { [descKey]: rawDesc });

                if (error) {
                  console.error(error);
                  toast.error("Error al actualizar masivamente");
                } else {
                  toast.success("Alias actualizado masivamente");
                }
              }}
            >
              Sí, a todas
            </button>
          </div>
        </div>
      ), { duration: Infinity });
    } else {
      const { error } = await supabase.from('transactions').update({ description: currentDesc }).eq('id', id);
      if (error) toast.error("Error al actualizar");
      else toast.success("Alias actualizado");
    }
  };

  const handleCategoryChange = async (id: string, newCategoryId: string, currentDesc: string) => {
    const newCategory = categories.find(c => c.id === newCategoryId) || null;
    
    // update locally immediately
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, category_id: newCategoryId || null, category: newCategory } : t));

    const othersCount = transactions.filter(t => t.id !== id && t.description === currentDesc && t.category_id !== newCategoryId).length;

    if (othersCount > 0 && newCategoryId) {
      toast.custom((t) => (
        <div className="card" style={{ padding: '1.5rem', border: '2px solid black', boxShadow: '4px 4px 0px black', background: 'white', maxWidth: '400px' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.125rem' }}>Categorización Múltiple</h3>
          <p style={{ margin: '0.5rem 0 1.5rem' }}>
            Hay otras {othersCount} transacciones con el alias "{currentDesc}". ¿Quieres asignarles la categoría "{newCategory?.name}" a todas ellas también?
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button 
              className="btn btn-outline" 
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} 
              onClick={async () => {
                toast.dismiss(t.id);
                const { error } = await supabase.from('transactions').update({ category_id: newCategoryId || null }).eq('id', id);
                if (error) toast.error("Error al actualizar");
                else toast.success("Categoría actualizada");
              }}
            >
              Solo a esta
            </button>
            <button 
              className="btn btn-primary" 
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} 
              onClick={async () => {
                toast.dismiss(t.id);
                
                setTransactions(prev => prev.map(tx => {
                  if (tx.description === currentDesc) {
                    return { ...tx, category_id: newCategoryId || null, category: newCategory };
                  }
                  return tx;
                }));

                const { error } = await supabase
                  .from('transactions')
                  .update({ category_id: newCategoryId || null })
                  .eq('user_id', user?.id)
                  .eq('description', currentDesc);

                if (error) {
                  console.error(error);
                  toast.error("Error al actualizar masivamente");
                } else {
                  toast.success("Categoría aplicada masivamente");
                }
              }}
            >
              Sí, a todas
            </button>
          </div>
        </div>
      ), { duration: Infinity });
    } else {
      const { error } = await supabase.from('transactions').update({ category_id: newCategoryId || null }).eq('id', id);
      if (error) toast.error("Error al actualizar");
      else toast.success("Categoría actualizada");
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', margin: 0 }}>Transacciones</h1>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 500, marginTop: '0.5rem' }}>
            Revisa y filtra todos tus movimientos
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              className="input" 
              placeholder="Buscar gasto..." 
              style={{ paddingLeft: '3rem', width: '200px' }}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          
          <select 
            className="input" 
            style={{ width: '120px', cursor: 'pointer' }}
            value={filterYear}
            onChange={(e) => {
              setFilterYear(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">Año</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select 
            className="input" 
            style={{ width: '120px', cursor: 'pointer' }}
            value={filterMonth}
            onChange={(e) => {
              setFilterMonth(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">Mes</option>
            <option value="1">Enero</option>
            <option value="2">Febrero</option>
            <option value="3">Marzo</option>
            <option value="4">Abril</option>
            <option value="5">Mayo</option>
            <option value="6">Junio</option>
            <option value="7">Julio</option>
            <option value="8">Agosto</option>
            <option value="9">Septiembre</option>
            <option value="10">Octubre</option>
            <option value="11">Noviembre</option>
            <option value="12">Diciembre</option>
          </select>

          <select 
            className="input" 
            style={{ width: '120px', cursor: 'pointer' }}
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setCurrentPage(1);
            }}
          >
            <option value="all">Tipo</option>
            <option value="ingreso">Abonos</option>
            <option value="egreso">Cargos</option>
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', fontWeight: 600 }}>Cargando transacciones...</div>
        ) : filteredTransactions.length === 0 ? (
          <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>No hay transacciones</h3>
            <p style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              Importa un archivo CSV o cambia tus filtros para ver resultados.
            </p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ backgroundColor: 'var(--primary-light)', borderBottom: '2px solid black' }}>
                  <tr>
                    <th style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 700 }}>Fecha</th>
                    <th style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 700 }}>Descripción (Alias)</th>
                    <th style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 700 }}>Categoría</th>
                    <th style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 700 }}>Tipo</th>
                    <th style={{ padding: '1rem', fontWeight: 700, textAlign: 'right' }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransactions.map((t, i) => {
                    const descKey = Object.keys(t.raw_data || {}).find(k => k.toLowerCase().includes('descripc')) || '';
                    const rawDesc = t.raw_data ? t.raw_data[descKey] : t.description;
                    
                    return (
                      <tr key={t.id} style={{ borderBottom: i < paginatedTransactions.length - 1 ? '2px solid black' : 'none', transition: 'background-color 0.1s' }} className="table-row">
                        <td style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 500 }}>
                          {new Date(t.date).toLocaleDateString('es-CL')}
                        </td>
                        <td style={{ padding: '0', borderRight: '2px solid black', position: 'relative' }}>
                          <input 
                            type="text"
                            value={t.description}
                            onChange={(e) => handleDescriptionChange(t.id, e.target.value)}
                            onBlur={() => handleDescriptionBlur(t.id, t.description, rawDesc)}
                            style={{ 
                              width: '100%', 
                              padding: '1rem', 
                              border: 'none', 
                              background: 'transparent',
                              fontWeight: t.description !== rawDesc ? 700 : 500,
                              color: t.description !== rawDesc ? 'var(--primary)' : 'inherit',
                              outline: 'none',
                              cursor: 'text'
                            }}
                          />
                          <Edit2 size={14} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.3, pointerEvents: 'none' }} />
                        </td>
                        <td style={{ padding: '0.5rem 1rem', borderRight: '2px solid black' }}>
                          <select
                            className="input-field"
                            style={{ 
                              padding: '0.5rem', 
                              border: '2px solid black', 
                              borderRadius: 'var(--radius-sm)',
                              width: '100%', 
                              maxWidth: '180px', 
                              backgroundColor: t.category?.color || 'white',
                              fontWeight: 600,
                              cursor: 'pointer',
                              outline: 'none'
                            }}
                            value={t.category_id || ''}
                            onChange={(e) => handleCategoryChange(t.id, e.target.value, t.description)}
                          >
                            <option value="">Sin Categoría</option>
                            {categories.map(c => (
                              <option key={c.id} value={c.id} style={{ backgroundColor: 'white' }}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '1rem', borderRight: '2px solid black' }}>
                          <span className={t.type === 'ingreso' ? 'badge badge-success' : 'badge badge-danger'}>
                            {t.type === 'ingreso' ? 'Abono' : 'Cargo'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem', fontWeight: 700, textAlign: 'right', fontSize: '1.125rem' }}>
                          ${t.amount.toLocaleString('es-CL')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', padding: '0.5rem' }}>
                <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Mostrando {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} de {filteredTransactions.length}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="btn btn-outline" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    Anterior
                  </button>
                  <button 
                    className="btn btn-outline" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
