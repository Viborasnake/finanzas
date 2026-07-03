import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Search } from 'lucide-react';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecurringItem, setSelectedRecurringItem] = useState<string | null>(null);
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
        .order('date', { ascending: true });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSummary = () => {
    let ingresos = 0;
    let egresos = 0;
    
    transactions.forEach(t => {
      if (t.type === 'ingreso') ingresos += t.amount;
      if (t.type === 'egreso') egresos += t.amount;
    });

    return { ingresos, egresos, balance: ingresos - egresos };
  };

  const getChartData = () => {
    const monthlyData: { [key: string]: { name: string, Ingresos: number, Egresos: number, dateObj: Date } } = {};

    transactions.forEach(t => {
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
    const expenses: { [desc: string]: { count: number, total: number, data: any[] } } = {};
    
    transactions.forEach(t => {
      if (t.type === 'egreso') {
        const desc = t.description;
        if (!expenses[desc]) {
          expenses[desc] = { count: 0, total: 0, data: [] };
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

  const generateInsightText = () => {
    if (transactions.length === 0) return <p>Importa tus datos para ver un análisis inteligente de tu situación financiera.</p>;

    const isDeficit = balance < 0;
    
    // Encontrar mayor ingreso
    const ingresosTx = transactions.filter(t => t.type === 'ingreso');
    const groupedIngresos: {[key:string]: number} = {};
    ingresosTx.forEach(t => {
      groupedIngresos[t.description] = (groupedIngresos[t.description] || 0) + t.amount;
    });
    const mainIngreso = Object.entries(groupedIngresos).sort((a,b) => b[1] - a[1])[0];

    // Mayor gasto recurrente
    const topRecurrente = recurringExpenses.length > 0 ? recurringExpenses[0] : null;

    return (
      <div style={{ fontSize: '1.125rem', lineHeight: '1.6' }}>
        <p style={{ marginBottom: '0.75rem' }}>
          Actualmente te encuentras en <strong>{isDeficit ? 'déficit' : 'superávit'}</strong> por un total de <strong style={{ color: isDeficit ? 'var(--danger)' : 'var(--success)' }}>${Math.abs(balance).toLocaleString('es-CL')}</strong>. 
          {isDeficit ? ' Estás gastando más de lo que ganas en este periodo.' : ' ¡Excelente trabajo manteniendo tus gastos bajo control!'}
        </p>
        
        {mainIngreso && ingresos > 0 && (
          <p style={{ marginBottom: '0.75rem' }}>
            Tus ingresos provienen principalmente de <strong>"{mainIngreso[0]}"</strong>, representando el {Math.round((mainIngreso[1] / ingresos) * 100)}% de todas tus entradas de dinero.
          </p>
        )}

        {topRecurrente && (
          <p style={{ margin: 0 }}>
            Tu mayor fuga de capital repetitiva es <strong>"{topRecurrente.name}"</strong>, donde has gastado un acumulado de <strong>${topRecurrente.total.toLocaleString('es-CL')}</strong> en {topRecurrente.count} pagos. Revisa la sección de tendencias abajo para ver si este gasto va en aumento.
          </p>
        )}
      </div>
    );
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', fontWeight: 600 }}>Cargando resumen...</div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: '2rem', fontSize: '2.5rem' }}>Resumen Financiero</h1>

      {/* Verbalización Inteligente */}
      <div className="card" style={{ marginBottom: '2rem', backgroundColor: 'var(--primary)', color: 'white' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          ✨ Análisis de Inteligencia Artificial
        </h3>
        {generateInsightText()}
      </div>

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
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1.5rem', borderBottom: '2px solid black', backgroundColor: 'var(--pastel-blue)' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Top Gastos Recurrentes</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, opacity: 0.8 }}>Haz clic en un ítem para ver su tendencia</p>
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
                      <td style={{ padding: '1rem', borderRight: '2px solid black', fontWeight: 600 }}>{item.name}</td>
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
