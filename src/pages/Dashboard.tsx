import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Search, Filter } from 'lucide-react';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecurringItem, setSelectedRecurringItem] = useState<string | null>(null);
  
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [groupByCategory, setGroupByCategory] = useState(false);

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
        .order('date', { ascending: true });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const availableYears = useMemo(() => {
    const years = new Set(transactions.map(t => new Date(t.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const date = new Date(t.date);
      const matchesYear = filterYear === 'all' || date.getFullYear().toString() === filterYear;
      const matchesMonth = filterMonth === 'all' || (date.getMonth() + 1).toString() === filterMonth;
      
      const catName = t.category?.name?.toLowerCase() || '';
      const isIgnored = catName.includes('ignorar') || catName.includes('traspaso');

      return matchesYear && matchesMonth && !isIgnored;
    });
  }, [transactions, filterYear, filterMonth]);

  const calculateSummary = () => {
    let ingresos = 0;
    let egresos = 0;
    
    filteredTransactions.forEach(t => {
      if (t.type === 'ingreso') ingresos += t.amount;
      if (t.type === 'egreso') egresos += t.amount;
    });

    return { ingresos, egresos, balance: ingresos - egresos };
  };

  const getChartData = () => {
    const monthlyData: { [key: string]: { name: string, Ingresos: number, Egresos: number, dateObj: Date } } = {};

    filteredTransactions.forEach(t => {
      const date = new Date(t.date);
      const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
      
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = { name: monthYear, Ingresos: 0, Egresos: 0, dateObj: date };
      }
      
      if (t.type === 'ingreso') {
        monthlyData[monthYear].Ingresos += t.amount;
      } else {
        monthlyData[monthYear].Egresos += t.amount;
      }
    });

    return Object.values(monthlyData).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  };

  const getRecurringExpenses = () => {
    const expenses: { [desc: string]: { count: number, total: number, data: any[], color: string } } = {};
    
    filteredTransactions.forEach(t => {
      if (t.type === 'egreso') {
        const desc = groupByCategory ? (t.category?.name || 'Sin Categoría') : t.description;
        if (!expenses[desc]) {
          expenses[desc] = { count: 0, total: 0, data: [], color: t.category?.color || '#e2e8f0' };
        }
        expenses[desc].count += 1;
        expenses[desc].total += t.amount;
        expenses[desc].data.push(t);
      }
    });

    return Object.entries(expenses)
      .filter(([_, info]) => info.count > 1)
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) => b.total - a.total);
  };

  const getSpecificItemTrend = (itemName: string) => {
    const recurringData = getRecurringExpenses();
    const itemData = recurringData.find(i => i.name === itemName);
    if (!itemData) return [];
    
    const monthly: { [key: string]: { name: string, Gasto: number, dateObj: Date } } = {};
    itemData.data.forEach(t => {
      const date = new Date(t.date);
      const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
      if (!monthly[monthYear]) {
        monthly[monthYear] = { name: monthYear, Gasto: 0, dateObj: new Date(date.getFullYear(), date.getMonth(), 1) };
      }
      monthly[monthYear].Gasto += t.amount;
    });

    return Object.values(monthly).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  };

  const { ingresos, egresos, balance } = calculateSummary();
  const chartData = getChartData();
  const recurringExpenses = getRecurringExpenses();

  useEffect(() => {
    if (!selectedRecurringItem && recurringExpenses.length > 0) {
      setSelectedRecurringItem(recurringExpenses[0].name);
    }
  }, [recurringExpenses, selectedRecurringItem]);

  const specificItemTrendData = selectedRecurringItem ? getSpecificItemTrend(selectedRecurringItem) : [];

  const generateInsightReport = () => {
    if (filteredTransactions.length === 0) return <p>Importa tus datos o cambia los filtros para ver un análisis inteligente de tu situación financiera.</p>;

    const isDeficit = balance < 0;
    
    const ingresosTx = filteredTransactions.filter(t => t.type === 'ingreso');
    const groupedIngresos: {[key:string]: number} = {};
    ingresosTx.forEach(t => {
      groupedIngresos[t.description] = (groupedIngresos[t.description] || 0) + t.amount;
    });
    const mainIngreso = Object.entries(groupedIngresos).sort((a,b) => b[1] - a[1])[0];

    const topRecurrente = recurringExpenses.length > 0 ? recurringExpenses[0] : null;

    return (
      <div className="card" style={{ marginBottom: '3rem', backgroundColor: 'white', position: 'relative', overflow: 'hidden', padding: '2rem' }}>
        {/* Barra de colores mágica superior */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '8px', background: 'linear-gradient(90deg, #c084fc, #38bdf8, #facc15)' }}></div>
        
        <h2 style={{ fontSize: '1.75rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: 0 }}>
          <span style={{ fontSize: '2rem' }}>✨</span> Reporte de Inteligencia
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          
          {/* Fila 1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ backgroundColor: isDeficit ? '#fecaca' : '#bbf7d0', padding: '1rem', border: '2px solid black', borderRadius: '50%', boxShadow: '3px 3px 0px black' }}>
              {isDeficit ? <TrendingDown size={28} /> : <TrendingUp size={28} />}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '1.15rem', lineHeight: '1.6', fontWeight: 500, color: 'var(--text-primary)' }}>
                Tu balance actual indica un <span style={{ fontWeight: 800, backgroundColor: isDeficit ? '#fecaca' : '#bbf7d0', padding: '0.2rem 0.6rem', border: '2px solid black', borderRadius: 'var(--radius-sm)', textTransform: 'uppercase' }}>{isDeficit ? 'Déficit' : 'Superávit'}</span> de <strong>${Math.abs(balance).toLocaleString('es-CL')}</strong>. 
                {isDeficit ? ' Presta atención, tus gastos están superando a tus ingresos en este periodo.' : ' ¡Vas por excelente camino manteniendo tus finanzas en verde!'}
              </p>
            </div>
          </div>

          {/* Fila 2 */}
          {mainIngreso && ingresos > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ backgroundColor: '#bfdbfe', padding: '1rem', border: '2px solid black', borderRadius: '50%', boxShadow: '3px 3px 0px black' }}>
                <DollarSign size={28} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '1.15rem', lineHeight: '1.6', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Tu motor principal de ingresos es <strong>"{mainIngreso[0]}"</strong>, el cual representa el <span style={{ fontWeight: 800, backgroundColor: '#bfdbfe', padding: '0.2rem 0.6rem', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>{Math.round((mainIngreso[1] / ingresos) * 100)}%</span> de todas tus entradas de dinero.
                </p>
              </div>
            </div>
          )}

          {/* Fila 3 */}
          {topRecurrente && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ backgroundColor: '#fef08a', padding: '1rem', border: '2px solid black', borderRadius: '50%', boxShadow: '3px 3px 0px black' }}>
                <Search size={28} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '1.15rem', lineHeight: '1.6', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Hemos detectado una fuga recurrente de capital en <strong>"{topRecurrente.name}"</strong>, con un acumulado de <span style={{ fontWeight: 800, backgroundColor: '#fef08a', padding: '0.2rem 0.6rem', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>${topRecurrente.total.toLocaleString('es-CL')}</span> repartido en {topRecurrente.count} pagos.
                </p>
              </div>
            </div>
          )}
          
        </div>
      </div>
    );
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', fontWeight: 600 }}>Cargando resumen...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '2.5rem' }}>Resumen Financiero</h1>
        
        {transactions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'white', padding: '0.5rem 1rem', border: '2px solid black', borderRadius: 'var(--radius-sm)', boxShadow: '2px 2px 0px black' }}>
            <Filter size={20} />
            <select 
              style={{ padding: '0.25rem', border: 'none', backgroundColor: 'transparent', outline: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
            >
              <option value="all">Todos los años</option>
              {availableYears.map(year => (
                <option key={year} value={year.toString()}>{year}</option>
              ))}
            </select>
            <div style={{ width: '2px', height: '20px', backgroundColor: 'black', margin: '0 0.5rem' }}></div>
            <select 
              style={{ padding: '0.25rem', border: 'none', backgroundColor: 'transparent', outline: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              <option value="all">Todos los meses</option>
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
          </div>
        )}
      </div>

      {/* Verbalización Inteligente */}
      {generateInsightReport()}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
        
        {/* Card Balance */}
        <div className="card" style={{ backgroundColor: 'var(--pastel-purple)', color: 'black' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700 }}>Balance Total</h3>
            <div style={{ backgroundColor: 'black', color: 'white', padding: '0.25rem', borderRadius: '50%' }}>
              <DollarSign size={24} />
            </div>
          </div>
          <p style={{ fontSize: '3rem', fontWeight: 800, margin: 0 }}>
            ${balance.toLocaleString('es-CL')}
          </p>
        </div>

        {/* Card Ingresos */}
        <div className="card" style={{ backgroundColor: 'var(--pastel-green)', color: 'black' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700 }}>Ingresos</h3>
            <div style={{ backgroundColor: 'black', color: 'var(--success)', padding: '0.25rem', borderRadius: '50%' }}>
              <TrendingUp size={24} />
            </div>
          </div>
          <p style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0 }}>
            ${ingresos.toLocaleString('es-CL')}
          </p>
        </div>

        {/* Card Egresos */}
        <div className="card" style={{ backgroundColor: 'var(--pastel-yellow)', color: 'black' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700 }}>Egresos</h3>
            <div style={{ backgroundColor: 'black', color: 'var(--danger)', padding: '0.25rem', borderRadius: '50%' }}>
              <TrendingDown size={24} />
            </div>
          </div>
          <p style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0 }}>
            ${egresos.toLocaleString('es-CL')}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>Evolución Mensual</h3>
        {chartData.length > 0 ? (
          <div style={{ height: '400px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#000" vertical={false} />
                <XAxis dataKey="name" stroke="#000" tick={{ fill: '#000', fontWeight: 600 }} />
                <YAxis stroke="#000" tick={{ fill: '#000', fontWeight: 600 }} />
                <Tooltip 
                  contentStyle={{ border: '2px solid black', boxShadow: '4px 4px 0px black', borderRadius: '8px', fontWeight: 600 }}
                  itemStyle={{ fontWeight: 700 }}
                />
                <Legend wrapperStyle={{ fontWeight: 600, paddingTop: '1rem' }} />
                <Bar dataKey="Egresos" fill="var(--danger)" stroke="black" strokeWidth={2} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Ingresos" fill="var(--success)" stroke="black" strokeWidth={2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            No hay datos suficientes para graficar. Importa un CSV para comenzar.
          </div>
        )}
      </div>

      <h2 style={{ marginBottom: '1.5rem', fontSize: '2rem' }}>Inteligencia y Hallazgos</h2>
      
      {recurringExpenses.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Search size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
          <p style={{ fontWeight: 600, fontSize: '1.2rem' }}>Aún no hay suficientes datos para detectar gastos recurrentes.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
          {/* Tabla de Top Recurrentes */}
          <div className="card" style={{ gridColumn: '1 / -1', padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '2rem', backgroundColor: '#bfdbfe', borderBottom: '2px solid black', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.5rem', marginBottom: '0.5rem' }}>Top Gastos Recurrentes</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Haz clic en un ítem para ver su tendencia</p>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'white', border: '2px solid black', borderRadius: 'var(--radius-sm)', overflow: 'hidden', boxShadow: '2px 2px 0px black' }}>
                <button 
                  onClick={() => { setGroupByCategory(false); setSelectedRecurringItem(null); }}
                  style={{ 
                    padding: '0.5rem 1rem', 
                    border: 'none', 
                    background: !groupByCategory ? 'black' : 'transparent',
                    color: !groupByCategory ? 'white' : 'black',
                    fontWeight: 700,
                    cursor: 'pointer',
                    borderRight: '2px solid black',
                    outline: 'none'
                  }}
                >
                  Por Ítem
                </button>
                <button 
                  onClick={() => { setGroupByCategory(true); setSelectedRecurringItem(null); }}
                  style={{ 
                    padding: '0.5rem 1rem', 
                    border: 'none', 
                    background: groupByCategory ? 'black' : 'transparent',
                    color: groupByCategory ? 'white' : 'black',
                    fontWeight: 700,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  Por Categoría
                </button>
              </div>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ backgroundColor: 'var(--primary-light)', borderBottom: '2px solid black' }}>
                  <tr>
                    <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Ítem</th>
                    <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Veces</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Total Pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringExpenses.map((item, i) => (
                    <tr 
                      key={i} 
                      onClick={() => setSelectedRecurringItem(item.name)}
                      style={{ 
                        borderBottom: i < recurringExpenses.length - 1 ? '2px solid black' : 'none',
                        backgroundColor: selectedRecurringItem === item.name ? 'var(--pastel-yellow)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background-color 0.1s'
                      }} 
                      className="table-row"
                    >
                      <td style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 600 }}>
                        {groupByCategory ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: item.color || '#ccc', border: '2px solid black' }}></div>
                            {item.name}
                          </div>
                        ) : (
                          item.name
                        )}
                      </td>
                      <td style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 500 }}>{item.count}</td>
                      <td style={{ padding: '1rem', fontWeight: 700, color: 'var(--danger)' }}>
                        ${item.total.toLocaleString('es-CL')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico de Tendencia Específico */}
          <div className="card">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>
              Tendencia Mensual: <span style={{ color: 'var(--primary)' }}>{selectedRecurringItem}</span>
            </h3>
            {specificItemTrendData.length > 0 ? (
              <div style={{ height: '300px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={specificItemTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                    <XAxis dataKey="name" stroke="black" fontWeight="600" />
                    <YAxis stroke="black" fontWeight="600" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '2px solid black', 
                        boxShadow: '4px 4px 0px black',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: '600'
                      }}
                      formatter={(value: any) => [`$${Number(value).toLocaleString('es-CL')}`, 'Gasto']}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="Gasto" 
                      stroke="var(--danger)" 
                      strokeWidth={4} 
                      activeDot={{ r: 8, stroke: 'black', strokeWidth: 2 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p style={{ textAlign: 'center', fontWeight: 500, color: 'var(--text-secondary)', padding: '2rem 0' }}>
                Selecciona un ítem para ver su tendencia
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
