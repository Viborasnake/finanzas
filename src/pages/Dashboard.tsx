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

            No hay datos suficientes para graficar. Importa un CSV para comenzar.
          </div>
        )}
      </div>
    </div>
  );
}
