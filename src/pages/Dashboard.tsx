import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
    const monthlyData: { [key: string]: { name: string, Ingresos: number, Egresos: number } } = {};

    transactions.forEach(t => {
      const date = new Date(t.date);
      const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
      
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = { name: monthYear, Ingresos: 0, Egresos: 0 };
      }
      
      if (t.type === 'ingreso') {
        monthlyData[monthYear].Ingresos += t.amount;
      } else {
        monthlyData[monthYear].Egresos += t.amount;
      }
    });

    return Object.values(monthlyData);
  };

  const { ingresos, egresos, balance } = calculateSummary();
  const chartData = getChartData();

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', fontWeight: 600 }}>Cargando resumen...</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '2rem' }}>Resumen Financiero</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
        
        {/* Card Balance */}
        <div className="card" style={{ backgroundColor: 'var(--primary)', color: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', margin: 0, opacity: 0.9 }}>Balance Total</h3>
            <DollarSign size={24} />
          </div>
          <p style={{ fontSize: '3rem', fontWeight: 700, margin: 0 }}>
            ${balance.toLocaleString('es-CL')}
          </p>
        </div>

        {/* Card Ingresos */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-secondary)' }}>Ingresos</h3>
            <TrendingUp size={24} color="var(--success)" />
          </div>
          <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: 0, color: 'var(--success)' }}>
            ${ingresos.toLocaleString('es-CL')}
          </p>
        </div>

        {/* Card Egresos */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-secondary)' }}>Egresos</h3>
            <TrendingDown size={24} color="var(--danger)" />
          </div>
          <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: 0, color: 'var(--danger)' }}>
            ${egresos.toLocaleString('es-CL')}
          </p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>Evolución Mensual</h2>
        
        {chartData.length > 0 ? (
          <div style={{ height: '400px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#000" vertical={false} />
                <XAxis dataKey="name" stroke="#000" tick={{ fill: '#000', fontWeight: 600 }} />
                <YAxis stroke="#000" tick={{ fill: '#000', fontWeight: 600 }} />
                <Tooltip 
                  contentStyle={{ border: '2px solid black', boxShadow: '4px 4px 0px black', borderRadius: '8px', fontWeight: 600 }}
                  itemStyle={{ fontWeight: 700 }}
                />
                <Legend wrapperStyle={{ fontWeight: 600, paddingTop: '1rem' }} />
                <Bar dataKey="Ingresos" fill="var(--success)" stroke="black" strokeWidth={2} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Egresos" fill="var(--danger)" stroke="black" strokeWidth={2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            No hay datos suficientes para graficar. Importa un CSV para comenzar.
          </div>
        )}
      </div>
    </div>
  );
}
