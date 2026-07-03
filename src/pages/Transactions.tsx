import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Filter, Search } from 'lucide-react';

export default function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, ingreso, egreso
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
        .order('date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || t.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', margin: 0 }}>Transacciones</h1>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 500, marginTop: '0.5rem' }}>
            Revisa y filtra todos tus movimientos
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              className="input" 
              placeholder="Buscar gasto..." 
              style={{ paddingLeft: '3rem', width: '250px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="input" 
            style={{ width: '150px', cursor: 'pointer' }}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">Todos</option>
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
          <div style={{ overflowX: 'auto', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: 'var(--primary-light)', borderBottom: '2px solid black' }}>
                <tr>
                  <th style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 700 }}>Fecha</th>
                  <th style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 700 }}>Descripción</th>
                  <th style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 700 }}>Categoría</th>
                  <th style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 700 }}>Tipo</th>
                  <th style={{ padding: '1rem', fontWeight: 700, textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((t, i) => (
                  <tr key={t.id} style={{ borderBottom: i < filteredTransactions.length - 1 ? '2px solid black' : 'none', transition: 'background-color 0.1s' }} className="table-row">
                    <td style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 500 }}>
                      {new Date(t.date).toLocaleDateString('es-CL')}
                    </td>
                    <td style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 600 }}>
                      {t.description}
                    </td>
                    <td style={{ padding: '1rem', borderRight: '2px solid black' }}>
                      <span className="badge" style={{ backgroundColor: '#e2e8f0', color: 'black' }}>
                        Sin Categoría
                      </span>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
