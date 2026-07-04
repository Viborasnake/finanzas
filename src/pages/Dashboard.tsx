import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Search, Filter, AlertTriangle, PiggyBank, Shuffle } from 'lucide-react';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecurringItem, setSelectedRecurringItem] = useState<string | null>(null);
  
  type PeriodType = 'month' | 'quarter' | 'semester' | 'year' | 'all';
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [filterYear, setFilterYear] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [groupByPrincipal, setGroupByPrincipal] = useState(true);
  const [hiddenPrincipals, setHiddenPrincipals] = useState<string[]>([]);
  const isRealExpenseMode = true;

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
        .neq('amount', 0)
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

  const availablePrincipals = useMemo(() => {
    const totals: { [cat: string]: number } = {};
    transactions.forEach(t => {
      if (t.categoria_principal) {
        if (!totals[t.categoria_principal]) totals[t.categoria_principal] = 0;
        totals[t.categoria_principal] += Math.abs(t.amount);
      }
    });
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);
  }, [transactions]);

  const toggleCategory = (catName: string) => {
    setHiddenPrincipals(prev => 
      prev.includes(catName) ? prev.filter(c => c !== catName) : [...prev, catName]
    );
  };

  // Base transactions respecting only time and hidden categories filters
  const baseTransactions = useMemo(() => {
    return transactions.filter(t => {
      const date = new Date(t.date);
      const m = date.getMonth() + 1;
      
      const matchesYear = filterYear === 'all' || date.getFullYear().toString() === filterYear;
      
      let matchesPeriod = filterPeriod === 'all';
      if (!matchesPeriod) {
        if (periodType === 'month') matchesPeriod = m.toString() === filterPeriod;
        else if (periodType === 'quarter') matchesPeriod = `Q${Math.ceil(m / 3)}` === filterPeriod;
        else if (periodType === 'semester') matchesPeriod = `H${m <= 6 ? 1 : 2}` === filterPeriod;
      }
      
      const catPrincipal = t.categoria_principal || 'Sin Clasificar';
      const isHidden = hiddenPrincipals.includes(catPrincipal);

      return matchesYear && matchesPeriod && !isHidden;
    });
  }, [transactions, filterYear, filterPeriod, periodType, hiddenPrincipals]);

  const calculateSummary = () => {
    let ingresosBrutos = 0;
    let ingresosReales = 0;
    let egresosReales = 0;
    let egresosTotales = 0;
    let ahorro = 0;
    let movimientosInternosIngreso = 0;
    let movimientosInternosEgreso = 0;
    
    baseTransactions.forEach(t => {
      const isInternal = t.tipo_movimiento === 'Movimiento Interno';
      const isAhorro = t.tipo_movimiento === 'Ahorro/Inversión';
      const isGastoReal = t.tipo_movimiento === 'Gasto Real';

      if (t.type === 'ingreso') {
        ingresosBrutos += t.amount;
        if (!isInternal) ingresosReales += t.amount;
        else movimientosInternosIngreso += t.amount;
      } else {
        egresosTotales += t.amount;
        if (isGastoReal) egresosReales += t.amount;
        if (isAhorro) ahorro += t.amount;
        if (isInternal) movimientosInternosEgreso += t.amount;
      }
    });

    const balanceReal = ingresosReales - egresosReales;
    const balanceFlujoCaja = ingresosBrutos - egresosTotales;

    // --- CÁLCULO DE PERÍODO ANTERIOR ---
    let prevIngresosReales = 0;
    let prevEgresosReales = 0;
    let prevIngresosBrutos = 0;
    let prevEgresosTotales = 0;
    let hasPrevData = false;
    let prevLabel = '';
    const prevPeriodTransactions: any[] = [];

    if (filterYear !== 'all' && (filterPeriod !== 'all' || periodType === 'year') && periodType !== 'all') {
      let py = parseInt(filterYear);
      let pp = filterPeriod;
      
      if (periodType === 'year') {
        py -= 1;
        prevLabel = 'año anterior';
      } else if (periodType === 'month') {
        let pm = parseInt(filterPeriod);
        if (pm === 1) { pm = 12; py -= 1; } else { pm -= 1; }
        pp = pm.toString();
        prevLabel = 'mes anterior';
      } else if (periodType === 'quarter') {
        let pq = parseInt(filterPeriod.replace('Q', ''));
        if (pq === 1) { pq = 4; py -= 1; } else { pq -= 1; }
        pp = `Q${pq}`;
        prevLabel = 'trimestre anterior';
      } else if (periodType === 'semester') {
        let ph = parseInt(filterPeriod.replace('H', ''));
        if (ph === 1) { ph = 2; py -= 1; } else { ph -= 1; }
        pp = `H${ph}`;
        prevLabel = 'semestre anterior';
      }

      transactions.forEach(t => {
        const date = new Date(t.date);
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        
        if (y !== py) return;
        
        let matchesPrevPeriod = true;
        if (periodType === 'month') matchesPrevPeriod = m.toString() === pp;
        else if (periodType === 'quarter') matchesPrevPeriod = `Q${Math.ceil(m / 3)}` === pp;
        else if (periodType === 'semester') matchesPrevPeriod = `H${m <= 6 ? 1 : 2}` === pp;

        if (matchesPrevPeriod) {
          const catPrincipal = t.categoria_principal || 'Sin Clasificar';
          if (!hiddenPrincipals.includes(catPrincipal)) {
            hasPrevData = true;
            
            const isInternal = t.tipo_movimiento === 'Movimiento Interno';
            const isGastoReal = t.tipo_movimiento === 'Gasto Real';

            if (t.type === 'ingreso') {
              prevIngresosBrutos += t.amount;
              if (!isInternal) prevIngresosReales += t.amount;
            } else {
              prevEgresosTotales += t.amount;
              if (isGastoReal) prevEgresosReales += t.amount;
            }
            prevPeriodTransactions.push(t);
          }
        }
      });
    }

    return { 
      ingresosBrutos, ingresosReales, egresosReales, egresosTotales, ahorro, movimientosInternosIngreso, movimientosInternosEgreso,
      balanceReal, balanceFlujoCaja,
      prevIngresosReales, prevEgresosReales, prevIngresosBrutos, prevEgresosTotales, hasPrevData, prevLabel, prevPeriodTransactions
    };
  };

  const getChartData = () => {
    let targetTransactions = baseTransactions;

    if (filterYear !== 'all' || (filterPeriod !== 'all' && periodType !== 'year' && periodType !== 'all')) {
      let endY = filterYear === 'all' ? new Date().getFullYear() : parseInt(filterYear);
      let endM = 12;

      if (filterPeriod !== 'all' && periodType !== 'all' && periodType !== 'year') {
        if (periodType === 'month') endM = parseInt(filterPeriod);
        else if (periodType === 'quarter') endM = parseInt(filterPeriod.replace('Q', '')) * 3;
        else if (periodType === 'semester') endM = parseInt(filterPeriod.replace('H', '')) * 6;
      }

      const endDate = new Date(endY, endM, 0, 23, 59, 59); // Ultimo dia del mes final
      const startDate = new Date(endY, endM - 6, 1); // 6 meses atras

      targetTransactions = transactions.filter(t => {
        const [y, m, d] = t.date.split('-');
        const date = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
        
        const catPrincipal = t.categoria_principal || 'Sin Clasificar';
        const isHidden = hiddenPrincipals.includes(catPrincipal);

        return date >= startDate && date <= endDate && !isHidden;
      });
    }

    const monthlyData: { [key: string]: { name: string, Ingresos: number, Egresos: number, dateObj: Date } } = {};

    targetTransactions.forEach(t => {
      const [y, m] = t.date.split('-');
      const date = new Date(parseInt(y), parseInt(m)-1, 1);
      const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
      
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = { name: monthYear, Ingresos: 0, Egresos: 0, dateObj: date };
      }
      
      const isInternal = t.tipo_movimiento === 'Movimiento Interno';
      const isGastoReal = t.tipo_movimiento === 'Gasto Real';

      if (isRealExpenseMode) {
        if (t.type === 'ingreso' && !isInternal) monthlyData[monthYear].Ingresos += t.amount;
        if (t.type === 'egreso' && isGastoReal) monthlyData[monthYear].Egresos += t.amount;
      } else {
        if (t.type === 'ingreso') monthlyData[monthYear].Ingresos += t.amount;
        if (t.type === 'egreso') monthlyData[monthYear].Egresos += t.amount;
      }
    });

    return Object.values(monthlyData).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  };

  const getRecurringExpenses = () => {
    const expenses: { [desc: string]: { count: number, total: number, data: any[] } } = {};
    
    baseTransactions.forEach(t => {
      const catPrincipal = t.categoria_principal || 'Sin Clasificar';
      const isFijo = catPrincipal.toLowerCase().includes('vivienda') || catPrincipal.toLowerCase().includes('fijo');
      
      // En modo gasto real, analizamos los "Gasto Real" variables
      if (t.type === 'egreso' && t.tipo_movimiento === 'Gasto Real' && !isFijo) {
        const desc = groupByPrincipal ? catPrincipal : (t.categoria_secundaria || catPrincipal);
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

  const getAnomalies = () => {
    if (!hasPrevData) return null;
    
    const currentCats: Record<string, number> = {};
    const prevCats: Record<string, number> = {};
    
    baseTransactions.forEach(t => {
      if (t.type === 'egreso' && t.tipo_movimiento === 'Gasto Real') {
        const cat = t.categoria_principal || 'Sin Clasificar';
        currentCats[cat] = (currentCats[cat] || 0) + t.amount;
      }
    });

    prevPeriodTransactions.forEach(t => {
      if (t.type === 'egreso' && t.tipo_movimiento === 'Gasto Real') {
        const cat = t.categoria_principal || 'Sin Clasificar';
        prevCats[cat] = (prevCats[cat] || 0) + t.amount;
      }
    });

    let maxAnomaly = null;
    let maxPct = 0;

    for (const [cat, currTotal] of Object.entries(currentCats)) {
      const prevTotal = prevCats[cat] || 0;
      if (prevTotal > 0 && currTotal > prevTotal) {
        const pctGrowth = ((currTotal - prevTotal) / prevTotal) * 100;
        const absGrowth = currTotal - prevTotal;
        // Flag anomaly if >40% growth AND at least $50,000 difference
        if (pctGrowth >= 40 && absGrowth >= 50000) {
          if (pctGrowth > maxPct) {
            maxPct = pctGrowth;
            maxAnomaly = { name: cat, pctGrowth, absGrowth, currTotal, prevTotal };
          }
        }
      }
    }

    return maxAnomaly;
  };



  const { 
    ingresosBrutos, ingresosReales, egresosReales, egresosTotales, ahorro, movimientosInternosEgreso,
    balanceReal, balanceFlujoCaja,
    prevIngresosReales, prevEgresosReales, prevIngresosBrutos, prevEgresosTotales, hasPrevData, prevLabel, prevPeriodTransactions 
  } = calculateSummary();
  
  const chartData = getChartData();
  const recurringExpenses = getRecurringExpenses();

  useEffect(() => {
    if (!selectedRecurringItem && recurringExpenses.length > 0) {
      setSelectedRecurringItem(recurringExpenses[0].name);
    }
  }, [recurringExpenses, selectedRecurringItem]);


  const generateInsightReport = (
    balance: number, 
    isDeficit: boolean,
    ingresoPrincipalVal: number
  ) => {
    if (baseTransactions.length === 0) return <p>Importa tus datos para ver un análisis inteligente.</p>;
    
    const ingresosTx = baseTransactions.filter(t => t.type === 'ingreso' && t.tipo_movimiento !== 'Movimiento Interno');
    const groupedIngresos: {[key:string]: number} = {};
    ingresosTx.forEach(t => {
      groupedIngresos[t.description] = (groupedIngresos[t.description] || 0) + t.amount;
    });
    const mainIngreso = Object.entries(groupedIngresos).sort((a,b) => b[1] - a[1])[0];
    const topRecurrente = recurringExpenses.length > 0 ? recurringExpenses[0] : null;

    return (
      <div className="card" style={{ marginBottom: '3rem', backgroundColor: 'white', position: 'relative', overflow: 'hidden', padding: '2rem' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '8px', background: 'linear-gradient(90deg, #c084fc, #38bdf8, #facc15)' }}></div>
        
        <h2 style={{ fontSize: '1.75rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: 0 }}>
          <span style={{ fontSize: '2rem' }}>✨</span> Reporte de Inteligencia
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ backgroundColor: isDeficit ? '#fecaca' : '#bbf7d0', padding: '1rem', border: '2px solid black', borderRadius: '50%', boxShadow: '3px 3px 0px black' }}>
              {isDeficit ? <TrendingDown size={28} /> : <TrendingUp size={28} />}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '1.15rem', lineHeight: '1.6', fontWeight: 500, color: 'var(--text-primary)' }}>
                Tu <strong>Gasto Real</strong> {isDeficit ? 'ha superado' : 'es menor'} a tu <strong>Ingreso Real</strong>, generando un <span style={{ fontWeight: 800, backgroundColor: isDeficit ? '#fecaca' : '#bbf7d0', padding: '0.2rem 0.6rem', border: '2px solid black', borderRadius: 'var(--radius-sm)', textTransform: 'uppercase' }}>{isDeficit ? 'Déficit' : 'Superávit'}</span> de <strong>${Math.abs(balance).toLocaleString('es-CL')}</strong>.
              </p>
            </div>
          </div>

          {mainIngreso && ingresoPrincipalVal > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ backgroundColor: '#bfdbfe', padding: '1rem', border: '2px solid black', borderRadius: '50%', boxShadow: '3px 3px 0px black' }}>
                <DollarSign size={28} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '1.15rem', lineHeight: '1.6', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Tu motor principal de ingresos reales es <strong>"{mainIngreso[0]}"</strong>, representando el <span style={{ fontWeight: 800, backgroundColor: '#bfdbfe', padding: '0.2rem 0.6rem', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>{Math.round((mainIngreso[1] / ingresoPrincipalVal) * 100)}%</span> de tus entradas de capital neto.
                </p>
              </div>
            </div>
          )}

          {topRecurrente && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ backgroundColor: '#fef08a', padding: '1rem', border: '2px solid black', borderRadius: '50%', boxShadow: '3px 3px 0px black' }}>
                <Search size={28} />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '1.15rem', lineHeight: '1.6', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Hemos detectado una fuga recurrente de capital en <strong>"{topRecurrente.name}"</strong>, con un acumulado de <span style={{ fontWeight: 800, backgroundColor: '#fef08a', padding: '0.2rem 0.6rem', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>${topRecurrente.total.toLocaleString('es-CL')}</span>.
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

  const renderChangeBadge = (current: number, prev: number, label: string, inverseColors = false) => {
    if (!hasPrevData) return null;
    if (prev === 0) {
      if (current === 0) return <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>Sin cambios vs {label}</span>;
      return <span style={{ fontSize: '0.875rem', fontWeight: 600, color: inverseColors ? '#ef4444' : '#22c55e' }}>▲ 100% vs {label}</span>;
    }
    const pct = ((current - prev) / prev) * 100;
    const isPositive = pct > 0;
    const isNegative = pct < 0;
    
    let color = '#64748b';
    if (isPositive) color = inverseColors ? '#ef4444' : '#22c55e';
    if (isNegative) color = inverseColors ? '#22c55e' : '#ef4444';

    const arrow = isPositive ? '▲' : isNegative ? '▼' : '▬';
    
    return (
      <span style={{ fontSize: '1rem', fontWeight: 700, color: color, display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem' }}>
        {arrow} {Math.abs(pct).toFixed(1)}% <span style={{ fontWeight: 500, color: '#64748b' }}>vs {label}</span>
      </span>
    );
  };

  const currentIngresos = isRealExpenseMode ? ingresosReales : ingresosBrutos;
  const currentEgresos = isRealExpenseMode ? egresosReales : egresosTotales;
  const currentBalance = isRealExpenseMode ? balanceReal : balanceFlujoCaja;
  const prevIngr = isRealExpenseMode ? prevIngresosReales : prevIngresosBrutos;
  const prevEgr = isRealExpenseMode ? prevEgresosReales : prevEgresosTotales;

  const margin = currentIngresos > 0 ? (currentBalance / currentIngresos) * 100 : 0;
  
  const renderTarjetaEstado = () => {
    let stateColor = '#22c55e'; 
    let bgColor = '#bbf7d0';
    let statusText = 'Superávit';
    
    if (currentBalance < 0) {
      stateColor = '#ef4444';
      bgColor = '#fecaca';
      statusText = 'Déficit';
    } else if (margin < 10) {
      stateColor = '#eab308';
      bgColor = '#fef08a';
      statusText = 'Ajustado';
    }

    return (
      <div className="card" style={{ backgroundColor: 'white', border: '3px solid ' + stateColor, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Balance Real</h2>
            <div style={{ display: 'inline-block', padding: '0.2rem 0.6rem', backgroundColor: bgColor, color: stateColor, borderRadius: 'var(--radius-sm)', fontWeight: 800, fontSize: '0.75rem', marginTop: '0.5rem', textTransform: 'uppercase' }}>
              {statusText}
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#f8fafc', padding: '0.5rem 1rem', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>
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
            <span style={{ fontWeight: 800 }}>/</span>
            <select 
              style={{ padding: '0.25rem', border: 'none', backgroundColor: 'transparent', outline: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}
              value={periodType}
              onChange={(e) => {
                setPeriodType(e.target.value as PeriodType);
                setFilterPeriod('all');
              }}
            >
              <option value="month">Mensual</option>
              <option value="quarter">Trimestral</option>
              <option value="semester">Semestral</option>
              <option value="year">Anual</option>
              <option value="all">Histórico</option>
            </select>
            
            {periodType !== 'year' && periodType !== 'all' && (
              <>
                <span style={{ fontWeight: 800 }}>/</span>
                <select 
                  style={{ padding: '0.25rem', border: 'none', backgroundColor: 'transparent', outline: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value)}
                >
                  <option value="all">Todos</option>
                  {periodType === 'month' && Array.from({length: 12}, (_, i) => (
                    <option key={`m${i+1}`} value={(i+1).toString()}>{new Date(2000, i, 1).toLocaleString('es-CL', { month: 'short' })}</option>
                  ))}
                  {periodType === 'quarter' && [1, 2, 3, 4].map(q => <option key={`q${q}`} value={`Q${q}`}>Q{q}</option>)}
                  {periodType === 'semester' && [1, 2].map(h => <option key={`h${h}`} value={`H${h}`}>H{h}</option>)}
                </select>
              </>
            )}
          </div>
        </div>

        <p style={{ fontSize: '3.5rem', fontWeight: 900, margin: 0, color: stateColor }}>
          ${currentBalance.toLocaleString('es-CL')}
        </p>
        <p style={{ margin: '1rem 0 0 0', fontWeight: 600, fontSize: '1rem', color: 'var(--text-secondary)' }}>
          De esto, <strong>${currentEgresos.toLocaleString('es-CL')}</strong> fue gasto real y <strong>${movimientosInternosEgreso.toLocaleString('es-CL')}</strong> fueron movimientos entre tus cuentas.
        </p>
      </div>
    );
  };

  const renderComparacionInmediata = () => {
    const maxVal = Math.max(currentIngresos, currentEgresos, 1);
    const ingrPct = (currentIngresos / maxVal) * 100;
    const egrPct = (currentEgresos / maxVal) * 100;

    return (
      <div className="card" style={{ backgroundColor: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem' }}>Comparación Inmediata</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 700 }}>
              <span>Ingreso Real</span>
              <span>${currentIngresos.toLocaleString('es-CL')}</span>
            </div>
            <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '24px', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ width: ingrPct + '%', backgroundColor: '#22c55e', height: '100%', transition: 'width 0.5s' }} />
            </div>
            {renderChangeBadge(currentIngresos, prevIngr, prevLabel, false)}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 700 }}>
              <span>Gasto Real</span>
              <span>${currentEgresos.toLocaleString('es-CL')}</span>
            </div>
            <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '24px', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ width: egrPct + '%', backgroundColor: '#ef4444', height: '100%', transition: 'width 0.5s' }} />
            </div>
            {renderChangeBadge(currentEgresos, prevEgr, prevLabel, true)}
          </div>
        </div>
      </div>
    );
  };

  const renderAlerts = () => {
    const uncategorized = baseTransactions.filter(t => !t.tipo_movimiento);
    const pct = baseTransactions.length > 0 ? (uncategorized.length / baseTransactions.length) * 100 : 0;
    const topRecurrente = recurringExpenses.length > 0 ? recurringExpenses[0] : null;
    const anomaly = getAnomalies();
    
    if (uncategorized.length === 0 && !topRecurrente && !anomaly) {
      return (
        <div style={{ backgroundColor: '#bbf7d0', padding: '1.5rem', border: '2px solid black', borderRadius: 'var(--radius-sm)', boxShadow: '4px 4px 0px black', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ backgroundColor: 'white', padding: '1rem', border: '2px solid black', borderRadius: '50%' }}>
            ✨
          </div>
          <div>
            <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', color: '#166534' }}>Todo en orden</h3>
            <p style={{ margin: 0, fontWeight: 500, color: '#15803d' }}>Todo tu historial está clasificado y no detectamos fugas ni anomalías este período.</p>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {uncategorized.length > 0 && (
          <div style={{ backgroundColor: pct > 5 ? '#fecaca' : '#fef08a', padding: '1.5rem', border: '2px solid black', borderRadius: 'var(--radius-sm)', boxShadow: '4px 4px 0px black', display: 'flex', alignItems: 'center', gap: '1.5rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ backgroundColor: 'white', padding: '1rem', border: '2px solid black', borderRadius: '50%' }}>
                <AlertTriangle size={28} color={pct > 5 ? "#b91c1c" : "#ca8a04"} />
              </div>
              <div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: pct > 5 ? '#7f1d1d' : '#854d0e' }}>
                  Atención: Transacciones sin clasificar
                </h3>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 500, color: pct > 5 ? '#991b1b' : '#a16207' }}>
                  Tienes <strong>{uncategorized.length} pagos</strong> sin clasificar ({pct.toFixed(1)}% del total).
                </p>
              </div>
            </div>
            <a href="/transactions" className="btn btn-primary" style={{ textDecoration: 'none', backgroundColor: pct > 5 ? '#b91c1c' : 'black' }}>
              Clasificar Ahora
            </a>
          </div>
        )}

        {topRecurrente && (
          <div style={{ backgroundColor: '#bfdbfe', padding: '1.5rem', border: '2px solid black', borderRadius: 'var(--radius-sm)', boxShadow: '4px 4px 0px black', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ backgroundColor: 'white', padding: '1rem', border: '2px solid black', borderRadius: '50%' }}>
              <Search size={28} color="#1d4ed8" />
            </div>
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#1e3a8a' }}>
                Fuga detectada: {topRecurrente.name}
              </h3>
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 500, color: '#1d4ed8' }}>
                Gasto recurrente fuera de tus cuentas fijas, sumando <strong>${topRecurrente.total.toLocaleString('es-CL')}</strong> ({topRecurrente.count} pagos).
              </p>
            </div>
          </div>
        )}

        {anomaly && (
          <div style={{ backgroundColor: '#fed7aa', padding: '1.5rem', border: '2px solid black', borderRadius: 'var(--radius-sm)', boxShadow: '4px 4px 0px black', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ backgroundColor: 'white', padding: '1rem', border: '2px solid black', borderRadius: '50%' }}>
              <TrendingUp size={28} color="#c2410c" />
            </div>
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#9a3412' }}>
                Crecimiento anómalo: {anomaly.name}
              </h3>
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 500, color: '#c2410c' }}>
                Esta categoría subió un <strong>{anomaly.pctGrowth.toFixed(1)}%</strong> (+${anomaly.absGrowth.toLocaleString('es-CL')}) vs {prevLabel}.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDesglose = () => {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem' }}>
        <div className="card" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '2rem', backgroundColor: 'var(--pastel-yellow)', borderBottom: '2px solid black', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.5rem', marginBottom: '0.5rem' }}>Top Categorías (Gasto Real)</h3>
              <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 500 }}>Donde se concentra tu dinero</p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'white', border: '2px solid black', borderRadius: 'var(--radius-sm)', overflow: 'hidden', boxShadow: '2px 2px 0px black' }}>
              <button 
                onClick={() => { setGroupByPrincipal(false); setSelectedRecurringItem(null); }}
                style={{ padding: '0.5rem 1rem', border: 'none', background: !groupByPrincipal ? 'black' : 'transparent', color: !groupByPrincipal ? 'white' : 'black', fontWeight: 700, cursor: 'pointer', borderRight: '2px solid black', outline: 'none' }}
              >
                Subcategoría
              </button>
              <button 
                onClick={() => { setGroupByPrincipal(true); setSelectedRecurringItem(null); }}
                style={{ padding: '0.5rem 1rem', border: 'none', background: groupByPrincipal ? 'black' : 'transparent', color: groupByPrincipal ? 'white' : 'black', fontWeight: 700, cursor: 'pointer', outline: 'none' }}
              >
                Principal
              </button>
            </div>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: 'var(--primary-light)', borderBottom: '2px solid black' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Categoría</th>
                  <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Cant.</th>
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
                      cursor: 'pointer', transition: 'background-color 0.1s'
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

        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '2rem', marginTop: 0 }}>Evolución Mensual</h3>
          {chartData.length > 0 ? (
            <div style={{ height: '400px', width: '100%', flex: 1 }}>
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
      </div>
    );
  };

  const renderInformativo = () => {
    if (ahorro === 0 && movimientosInternosEgreso === 0) return null;
    return (
      <div style={{ marginTop: '2rem' }}>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Informativo / No Urgente</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
          {ahorro > 0 && (
            <div className="card" style={{ backgroundColor: '#86efac', borderStyle: 'dashed' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 700 }}>Patrimonio / Ahorro</h3>
                <PiggyBank size={20} />
              </div>
              <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>${ahorro.toLocaleString('es-CL')}</p>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0.5rem 0 0 0', opacity: 0.8 }}>Capital retenido (No resta del balance real)</p>
            </div>
          )}
          {movimientosInternosEgreso > 0 && (
            <div className="card" style={{ backgroundColor: '#e2e8f0', borderStyle: 'dashed' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 700 }}>Movimientos Internos</h3>
                <Shuffle size={20} />
              </div>
              <p style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>${movimientosInternosEgreso.toLocaleString('es-CL')}</p>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0.5rem 0 0 0', opacity: 0.8 }}>Traspasos entre tus propias cuentas</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', paddingBottom: '4rem' }}>
      
      {transactions.length === 0 ? (
        <div className="card" style={{ backgroundColor: 'white', textAlign: 'center', padding: '6rem 2rem', border: '3px dashed black' }}>
          <h2 style={{ fontSize: '2rem', margin: '0 0 1rem 0' }}>Aún no tienes movimientos cargados</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.1rem', fontWeight: 500 }}>
            Para ver tu balance y análisis financiero, necesitas importar tus cartolas bancarias.
          </p>
          <a href="/import" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>Importar Transacciones</a>
        </div>
      ) : baseTransactions.length === 0 ? (
        <>
          {renderTarjetaEstado()}
          <div className="card" style={{ backgroundColor: 'white', textAlign: 'center', padding: '4rem 2rem' }}>
            <h2 style={{ fontSize: '1.5rem', margin: '0 0 1rem 0' }}>No hay movimientos registrados en este período</h2>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontWeight: 500 }}>Prueba seleccionando otro rango de fechas en los filtros superiores.</p>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
            {renderTarjetaEstado()}
            {renderComparacionInmediata()}
          </div>

          {availablePrincipals.length > 0 && (
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.875rem', marginRight: '1rem' }}>Filtros Rapidos:</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {availablePrincipals.map(catName => {
                  const isHidden = hiddenPrincipals.includes(catName);
                  return (
                    <button
                      key={catName}
                      onClick={() => toggleCategory(catName)}
                      style={{
                        padding: '0.2rem 0.6rem', borderRadius: '1rem', border: '2px solid black',
                        backgroundColor: isHidden ? '#f1f5f9' : '#bfdbfe',
                        color: isHidden ? '#94a3b8' : 'black',
                        fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                        boxShadow: isHidden ? 'none' : '1px 1px 0px black',
                        opacity: isHidden ? 0.7 : 1, transition: 'all 0.1s'
                      }}
                    >
                      {isHidden ? '❌' : '✅'} {catName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {renderAlerts()}
          
          {renderDesglose()}

          {generateInsightReport(currentBalance, currentBalance < 0, ingresosReales)}

          {renderInformativo()}
        </>
      )}
    </div>
  );
}
