import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';

export const TAXONOMY: Record<string, Record<string, string[]>> = {
  'Gasto Real': {
    'Alimentación': ['Supermercado', 'Feria', 'Abarrotes', 'Panadería', 'Cafetería/Snacks', 'Agua', 'Delivery/Restaurantes'],
    'Transporte': ['Bencina', 'Autopista', 'Estacionamiento', 'Transporte Público', 'Uber/Taxi', 'Seguro Auto', 'Mantención/Taller', 'Lavado Auto', 'Permisos', 'Municipalidad', 'Revisión Técnica'],
    'Vivienda': ['Dividendo', 'Contribuciones', 'Fijo', 'Seguro Hogar'],
    'Cuentas Básicas': ['Luz', 'Agua', 'Gas', 'GGCC', 'Internet Hogar', 'Internet Móvil', 'TV Cable', 'Telefonía'],
    'Hogar/Materiales': ['Bazar-Chinos', 'Ferretería', 'Mantenimiento/Mejoras', 'Muebles', 'Aseo'],
    'Salud': ['Farmacia', 'Consultas Médicas', 'Exámenes', 'Dentista', 'Seguro Salud/Isapre/Fonasa', 'Salud'],
    'Personal': ['Cuidado Personal', 'Peluquería', 'Ropa', 'Otros'],
    'Educación': ['Universidad/Instituto', 'Cursos/Diplomados', 'Materiales/Libros', 'Educación'],
    'Benja': ['Colegio', 'Salud/Pediatra', 'Ropa/Zapatos', 'Útiles/Materiales', 'Juguetes/Entretención', 'Mesada', 'Benja'],
    'Suscripciones': ['HBO MAX', 'Claude', 'Chat GPT', 'Google', 'Netflix', 'Spotify', 'Amazon Prime', 'Otras'],
    'Entretención/Ocio': ['Cine/Espectáculos', 'Paseos/Vacaciones', 'Deporte/Gimnasio', 'Regalos'],
    'Actividad Extra': ['Actividad Extra'],
    'Retro Gaming/Hobbies': ['Retro Gaming/Hobbies'],
    'Mascotas': ['Alimento', 'Veterinario', 'Accesorios/Peluquería'],
    'Herramientas/Software': ['Herramientas/Software'],
    'Pago a Familiar': ['Pago a Familiar'],
    'Impuestos': ['Impuestos'],
    'Intereses y Comisiones': ['Mantención Cuenta', 'Comisiones', 'Seguro Desgravamen/Fraude', 'Intereses'],
    'Pago Tarjeta Crédito': ['Tarjeta Credito'],
    'Sin Especificar': ['Sin Especificar']
  },
  'Movimiento Interno': {
    'Transferencia personal': ['Transferencia personal'],
    'Traspaso fondo': ['Traspaso fondo']
  },
  'Ahorro/Inversión': {
    'Ahorro': ['Ahorro'],
    'Inversión': ['Inversión']
  }
};



const ALL_OPTIONS = Object.entries(TAXONOMY).flatMap(([tipo, principals]) => 
  Object.entries(principals).flatMap(([principal, secundarias]) => 
    secundarias.map(secundaria => ({
      label: secundaria === principal ? principal : `${secundaria} (${principal})`,
      tipo,
      principal,
      secundaria
    }))
  )
);

export function CascadingCategorySelector({ initialPrincipal, initialSecundaria, onSave }: any) {
  const [inputValue, setInputValue] = useState(() => {
    if (initialSecundaria && initialPrincipal) {
      return initialSecundaria === initialPrincipal ? initialPrincipal : `${initialSecundaria} (${initialPrincipal})`;
    }
    return '';
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    
    if (val === '') {
      onSave(null, null, null);
      return;
    }

    const match = ALL_OPTIONS.find(o => o.label === val);
    if (match) {
      onSave(match.tipo, match.principal, match.secundaria);
    }
  };

  const isComplete = ALL_OPTIONS.some(o => o.label === inputValue);

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <input 
        list="taxonomy-options"
        value={inputValue}
        onChange={handleInputChange}
        className="input"
        placeholder="Clasificar..."
        style={{ 
          padding: '0.25rem 0.5rem', 
          fontSize: '0.875rem', 
          width: '200px',
          fontWeight: 600,
          backgroundColor: isComplete ? '#bbf7d0' : 'white',
          borderColor: 'black'
        }}
      />
      <datalist id="taxonomy-options">
        {ALL_OPTIONS.map((o, i) => <option key={i} value={o.label} />)}
      </datalist>
      {!isComplete && inputValue !== '' && (
        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Pendiente...</span>
      )}
    </div>
  );
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [viewMode, setViewMode] = useState<'individual' | 'bulk'>('individual');

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
        .select('*')
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

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const availableYears = useMemo(() => {
    const years = new Set(transactions.map(t => new Date(t.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  const filteredTransactions = transactions.filter(t => {
    const desc = t.description || '';
    const matchesSearch = desc.toLowerCase().includes(searchTerm.toLowerCase());
    
    const date = new Date(t.date);
    const matchesYear = filterYear === 'all' || date.getFullYear().toString() === filterYear;
    const matchesMonth = filterMonth === 'all' || (date.getMonth() + 1).toString() === filterMonth;

    const matchesType = filterType === 'all' || (filterType === 'expense' ? t.amount < 0 : t.amount > 0);
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'classified' ? !!t.tipo_movimiento : !t.tipo_movimiento);

    return matchesSearch && matchesYear && matchesMonth && matchesType && matchesStatus;
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage, 
    currentPage * itemsPerPage
  );

  const bulkGroups = useMemo(() => {
    if (viewMode !== 'bulk') return [];
    
    // Sin clasificar son las que no tienen tipo_movimiento
    const uncategorized = transactions.filter(t => !t.tipo_movimiento);
    const groups: { [desc: string]: { count: number, total: number, ids: string[] } } = {};
    
    uncategorized.forEach(t => {
      const desc = (t.original_description || t.description || '').trim();
      if (!desc) return;

      if (!groups[desc]) {
        groups[desc] = { count: 0, total: 0, ids: [] };
      }
      groups[desc].count += 1;
      groups[desc].total += t.type === 'egreso' ? t.amount : 0; 
      groups[desc].ids.push(t.id);
    });

    return Object.entries(groups)
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) => b.total - a.total);
  }, [transactions, viewMode]);

  const handleCategorize = async (id: string, currentDesc: string, tipo: string | null, principal: string | null, secundaria: string | null) => {
    // Update locally
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria } : t));

    const othersCount = transactions.filter(t => t.id !== id && t.description === currentDesc && !t.tipo_movimiento).length;

    if (othersCount > 0 && tipo) {
      toast.custom((t) => (
        <div className="card" style={{ padding: '1.5rem', border: '2px solid black', boxShadow: '4px 4px 0px black', background: 'white', maxWidth: '400px' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.125rem' }}>Categorización Múltiple</h3>
          <p style={{ margin: '0.5rem 0 1.5rem' }}>
            Hay otras {othersCount} transacciones sin clasificar con el alias "{currentDesc}". ¿Quieres aplicarles esta misma categoría?
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button 
              className="btn btn-outline" 
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} 
              onClick={async () => {
                toast.dismiss(t.id);
                const { error } = await supabase.from('transactions').update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria }).eq('id', id);
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
                  if (tx.description === currentDesc && !tx.tipo_movimiento) {
                    return { ...tx, tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria };
                  }
                  return tx;
                }));

                const { error } = await supabase
                  .from('transactions')
                  .update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria })
                  .eq('user_id', user?.id)
                  .eq('description', currentDesc)
                  .is('tipo_movimiento', null);

                if (error) {
                  console.error(error);
                  toast.error("Error al actualizar masivamente");
                } else {
                  toast.success("Categoría actualizada masivamente");
                }
              }}
            >
              Sí, a todas
            </button>
          </div>
        </div>
      ), { duration: Infinity });
    } else {
      const { error } = await supabase.from('transactions').update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria }).eq('id', id);
      if (error) toast.error("Error al actualizar");
      else toast.success("Categoría actualizada");
    }
  };

  const handleBulkCategorize = async (groupIds: string[], tipo: string | null, principal: string | null, secundaria: string | null) => {
    if (!tipo) return;
    
    try {
      const { error } = await supabase
        .from('transactions')
        .update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria })
        .in('id', groupIds);
        
      if (error) throw error;
      
      setTransactions(prev => prev.map(t => 
        groupIds.includes(t.id) ? { ...t, tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria } : t
      ));
      
      toast.success(`Se categorizaron ${groupIds.length} transacciones`);
    } catch (error) {
      console.error(error);
      toast.error('Error al categorizar');
    }
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
            Hay otras {othersCount} transacciones originales iguales. ¿Renombrar todas a "{currentDesc}"?
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button 
              className="btn btn-outline" 
              onClick={async () => {
                toast.dismiss(t.id);
                await supabase.from('transactions').update({ description: currentDesc }).eq('id', id);
              }}
            >
              Solo a esta
            </button>
            <button 
              className="btn btn-primary" 
              onClick={async () => {
                toast.dismiss(t.id);
                const descKey = Object.keys(originalTx.raw_data).find(k => k.toLowerCase().includes('descripc')) || '';
                
                setTransactions(prev => prev.map(tx => {
                  if (tx.raw_data && tx.raw_data[descKey] === rawDesc) return { ...tx, description: currentDesc };
                  return tx;
                }));

                await supabase.from('transactions').update({ description: currentDesc }).eq('user_id', user?.id).contains('raw_data', { [descKey]: rawDesc });
                toast.success("Actualizado masivamente");
              }}
            >
              Sí, a todas
            </button>
          </div>
        </div>
      ), { duration: Infinity });
    } else {
      await supabase.from('transactions').update({ description: currentDesc }).eq('id', id);
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Cargando transacciones...</div>;

  const uncatCount = transactions.filter(t => !t.tipo_movimiento).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: '0 0 1rem 0', fontSize: '2.5rem' }}>Transacciones</h1>
          {uncatCount > 0 && (
            <div style={{ display: 'inline-block', backgroundColor: '#fef08a', color: '#854d0e', padding: '0.5rem 1rem', borderRadius: '2rem', border: '2px solid black', fontWeight: 800, fontSize: '0.875rem' }}>
              Faltan {uncatCount} transacciones por clasificar
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', backgroundColor: 'white', border: '2px solid black', borderRadius: '2rem', overflow: 'hidden', boxShadow: '4px 4px 0px black' }}>
          <button 
            onClick={() => setViewMode('individual')}
            style={{ padding: '0.75rem 1.5rem', border: 'none', background: viewMode === 'individual' ? 'black' : 'transparent', color: viewMode === 'individual' ? 'white' : 'black', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', transition: 'all 0.1s' }}
          >
            Lista Individual
          </button>
          <button 
            onClick={() => setViewMode('bulk')}
            style={{ padding: '0.75rem 1.5rem', border: 'none', background: viewMode === 'bulk' ? 'black' : 'transparent', color: viewMode === 'bulk' ? 'white' : 'black', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', transition: 'all 0.1s' }}
          >
            Categorización Masiva ✨
          </button>
        </div>
      </div>

      {viewMode === 'bulk' ? (
        <div className="card" style={{ backgroundColor: 'var(--pastel-yellow)' }}>
          <h2 style={{ marginTop: 0 }}>Categorización Masiva</h2>
          <p style={{ fontWeight: 500, marginBottom: '2rem' }}>
            Agrupamos las transacciones <strong>Sin Clasificar</strong> que tienen la misma descripción original para que las categorices todas con un solo clic.
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', backgroundColor: 'white', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>
            <thead style={{ backgroundColor: 'black', color: 'white' }}>
              <tr>
                <th style={{ padding: '1rem', fontWeight: 800 }}>Descripción Base</th>
                <th style={{ padding: '1rem', fontWeight: 800 }}>Cant.</th>
                <th style={{ padding: '1rem', fontWeight: 800 }}>Monto Acumulado (Egresos)</th>
                <th style={{ padding: '1rem', fontWeight: 800 }}>Clasificar como...</th>
              </tr>
            </thead>
            <tbody>
              {bulkGroups.map((group) => (
                <tr key={group.name} style={{ borderBottom: '2px solid black' }}>
                  <td style={{ padding: '1rem', fontWeight: 700 }}>{group.name}</td>
                  <td style={{ padding: '1rem', fontWeight: 800, fontSize: '1.25rem' }}>{group.count}</td>
                  <td style={{ padding: '1rem', fontWeight: 800, color: 'var(--danger)' }}>
                    ${group.total.toLocaleString('es-CL')}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <CascadingCategorySelector 
                      initialTipo={null} initialPrincipal={null} initialSecundaria={null}
                      onSave={(t: any, p: any, s: any) => handleBulkCategorize(group.ids, t, p, s)}
                    />
                  </td>
                </tr>
              ))}
              {bulkGroups.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', fontWeight: 600 }}>
                    ¡No tienes transacciones pendientes de clasificar!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header filtros */}
          <div style={{ padding: '1.5rem', backgroundColor: '#f1f5f9', borderBottom: '2px solid black', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
              <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input 
                type="text" 
                className="input" 
                placeholder="Buscar por descripción..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '3rem' }}
              />
            </div>
            
            <select className="input" style={{ width: 'auto' }} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              <option value="all">Todos los años</option>
              {availableYears.map(y => <option key={y} value={y.toString()}>{y}</option>)}
            </select>
            
            <select className="input" style={{ width: 'auto' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
              <option value="all">Todos los meses</option>
              {Array.from({length: 12}, (_, i) => <option key={i+1} value={(i+1).toString()}>{new Date(2000, i, 1).toLocaleString('es-CL', { month: 'long' })}</option>)}
            </select>

            <select className="input" style={{ width: 'auto' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">Ingresos y Egresos</option>
              <option value="expense">Solo Egresos</option>
              <option value="income">Solo Ingresos</option>
            </select>
            
            <select className="input" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">Todas las transacciones</option>
              <option value="classified">Clasificadas</option>
              <option value="unclassified">Por clasificar</option>
            </select>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
              <thead style={{ backgroundColor: 'black', color: 'white' }}>
                <tr>
                  <th style={{ padding: '1rem', fontWeight: 800 }}>Fecha</th>
                  <th style={{ padding: '1rem', fontWeight: 800, width: '30%' }}>Descripción (Editable)</th>
                  <th style={{ padding: '1rem', fontWeight: 800 }}>Monto</th>
                  <th style={{ padding: '1rem', fontWeight: 800, width: '40%' }}>Clasificación</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((tx, i) => {
                  const rawDescKey = tx.raw_data ? Object.keys(tx.raw_data).find(k => k.toLowerCase().includes('descripc')) || '' : '';
                  const rawDesc = tx.raw_data ? tx.raw_data[rawDescKey] : '';

                  return (
                    <tr key={tx.id} style={{ borderBottom: '2px solid black', backgroundColor: i % 2 === 0 ? 'white' : 'rgba(0,0,0,0.02)' }} className="table-row">
                      <td style={{ padding: '1rem', fontWeight: 600 }}>{tx.date}</td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'transparent', border: '1px solid transparent' }} className="editable-cell">
                          <input 
                            type="text" 
                            value={tx.description} 
                            onChange={(e) => setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, description: e.target.value } : t))}
                            onBlur={(e) => handleDescriptionBlur(tx.id, e.target.value, rawDesc)}
                            style={{ 
                              border: 'none', background: 'transparent', fontWeight: 700, width: '100%', outline: 'none', fontSize: '1rem'
                            }}
                          />
                          <Edit2 size={16} color="#94a3b8" />
                        </div>
                        {rawDesc && tx.description !== rawDesc && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                            Orig: {rawDesc}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1rem', fontWeight: 800, color: tx.type === 'ingreso' ? 'var(--success)' : 'var(--danger)' }}>
                        {tx.type === 'ingreso' ? '+' : '-'}${tx.amount.toLocaleString('es-CL')}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <CascadingCategorySelector 
                          initialTipo={tx.tipo_movimiento}
                          initialPrincipal={tx.categoria_principal}
                          initialSecundaria={tx.categoria_secundaria}
                          onSave={(t: any, p: any, s: any) => handleCategorize(tx.id, tx.description, t, p, s)}
                        />
                      </td>
                    </tr>
                  )
                })}
                {paginatedTransactions.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      No se encontraron transacciones.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ padding: '1rem', borderTop: '2px solid black', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
              <button 
                className="btn btn-outline" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                Anterior
              </button>
              <span style={{ fontWeight: 700 }}>
                Página {currentPage} de {totalPages}
              </span>
              <button 
                className="btn btn-outline" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
