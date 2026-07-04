import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  Wallet, CreditCard, AlertTriangle, Sparkles, Activity, Search
} from 'lucide-react';
import { 
  AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

type ViewMode = 'month' | 'quarter' | 'year';
type CategoryLevel = 'principal' | 'secundaria';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const { user } = useAuth();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  const [categoryLevel, setCategoryLevel] = useState<CategoryLevel>('principal');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

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
    }
  };

  // --- Date Math Helpers ---
  const getPeriodRange = (date: Date, mode: ViewMode, offset: number = 0) => {
    const d = new Date(date);
    if (mode === 'month') {
      d.setMonth(d.getMonth() + offset);
      return {
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
      };
    } else if (mode === 'quarter') {
      const q = Math.floor(d.getMonth() / 3) + offset;
      return {
        start: new Date(d.getFullYear(), q * 3, 1),
        end: new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59)
      };
    } else {
      d.setFullYear(d.getFullYear() + offset);
      return {
        start: new Date(d.getFullYear(), 0, 1),
        end: new Date(d.getFullYear(), 11, 31, 23, 59, 59)
      };
    }
  };

  const shiftPeriod = (dir: number) => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + dir);
    else if (viewMode === 'quarter') d.setMonth(d.getMonth() + (dir * 3));
    else d.setFullYear(d.getFullYear() + dir);
    setCurrentDate(d);
    // Clear filters on period change
    setActiveFilters([]);
  };

  const getPeriodLabel = (date: Date, mode: ViewMode) => {
    if (mode === 'month') {
      return date.toLocaleString('es-CL', { month: 'long', year: 'numeric' });
    } else if (mode === 'quarter') {
      const q = Math.floor(date.getMonth() / 3) + 1;
      return `Q${q} ${date.getFullYear()}`;
    } else {
      return date.getFullYear().toString();
    }
  };

  const getShortLabel = (date: Date, mode: ViewMode) => {
    if (mode === 'month') return date.toLocaleString('es-CL', { month: 'short' });
    if (mode === 'quarter') return `Q${Math.floor(date.getMonth() / 3) + 1}`;
    return date.getFullYear().toString();
  };

  const toggleFilter = (cat: string) => {
    setActiveFilters(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  // --- Computations ---
  const { currentRange, prevRange } = useMemo(() => {
    return {
      currentRange: getPeriodRange(currentDate, viewMode, 0),
      prevRange: getPeriodRange(currentDate, viewMode, -1)
    };
  }, [currentDate, viewMode]);

  const stats = useMemo(() => {
    const calcForRange = (start: Date, end: Date, filters: string[]) => {
      let ingresos = 0;
      let aportePropio = 0;
      let sueldo = 0;
      let honorarios = 0;
      let ingresosOtros = 0;
      
      let gastos = 0; // Filtered gastos
      let gastosTotales = 0; // Absolute all gastos (for balance)
      
      const catsPrincipal: Record<string, number> = {};
      const catsSecundaria: Record<string, number> = {};
      let unclassifiedCount = 0;

      const availableCats = new Set<string>();

      let maxIncomeDesc = '';
      let maxIncomeAmount = 0;
      const recurringExpenses: Record<string, { total: number; count: number }> = {};

      const txs = transactions.filter(t => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      });

      txs.forEach(t => {
        const isInternal = t.tipo_movimiento === 'Movimiento Interno';
        const isInvestment = t.tipo_movimiento === 'Ahorro/Inversión';
        const isUnclassified = !t.categoria_principal || t.categoria_principal === 'Sin Clasificar';

        if (t.type === 'ingreso') {
          if (isInternal) {
            aportePropio += t.amount;
          } else {
            ingresos += t.amount;
            
            const catP = t.categoria_principal?.toLowerCase() || '';
            if (catP.includes('sueldo')) {
              sueldo += t.amount;
            } else if (catP.includes('honorarios') || catP.includes('profesionales')) {
              honorarios += t.amount;
            } else {
              ingresosOtros += t.amount;
            }

            // For intelligence
            if (t.amount > maxIncomeAmount) {
              maxIncomeAmount = t.amount;
              maxIncomeDesc = t.description || t.categoria_principal || 'Ingreso';
            }
          }
        } else {
          // Gasto
          if (!isInternal && !isInvestment) {
            const absAmt = Math.abs(t.amount);
            gastosTotales += absAmt;
            
            const catP = t.categoria_principal || 'Sin Clasificar';
            const catS = t.categoria_secundaria || 'Sin Clasificar';
            
            availableCats.add(catP);
            
            // Intelligence logic
            const desc = (t.description || 'Gasto').toUpperCase();
            if (!recurringExpenses[desc]) recurringExpenses[desc] = { total: 0, count: 0 };
            recurringExpenses[desc].total += absAmt;
            recurringExpenses[desc].count += 1;

            // Applying Filters
            if (filters.length === 0 || filters.includes(catP)) {
              gastos += absAmt;
              catsPrincipal[catP] = (catsPrincipal[catP] || 0) + absAmt;
              catsSecundaria[catS] = (catsSecundaria[catS] || 0) + absAmt;
            }

            if (isUnclassified) unclassifiedCount++;
          }
        }
      });

      const topCatsPrincipal = Object.entries(catsPrincipal)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);

      const topCatsSecundaria = Object.entries(catsSecundaria)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);

      // Intelligence Insights
      let maxRecurringDesc = '';
      let maxRecurringTotal = 0;
      let maxRecurringCount = 0;
      
      Object.entries(recurringExpenses).forEach(([desc, data]) => {
        if (data.count > 1 && data.total > maxRecurringTotal) {
          maxRecurringTotal = data.total;
          maxRecurringDesc = desc;
          maxRecurringCount = data.count;
        }
      });
      // Fallback if no recurring found, just pick the highest single expense
      if (maxRecurringTotal === 0) {
        Object.entries(recurringExpenses).forEach(([desc, data]) => {
          if (data.total > maxRecurringTotal) {
            maxRecurringTotal = data.total;
            maxRecurringDesc = desc;
            maxRecurringCount = data.count;
          }
        });
      }

      return {
        ingresos,
        aportePropio,
        sueldo,
        honorarios,
        ingresosOtros,
        gastos, // Filtered
        gastosTotales, // Unfiltered
        topCatsPrincipal,
        topCatsSecundaria,
        unclassifiedCount,
        availableCats: Array.from(availableCats).sort(),
        insights: {
          balance: ingresos - gastosTotales,
          maxIncomeDesc,
          maxIncomeAmount,
          maxRecurringDesc,
          maxRecurringTotal,
          maxRecurringCount
        }
      };
    };

    return { 
      current: calcForRange(currentRange.start, currentRange.end, activeFilters), 
      prev: calcForRange(prevRange.start, prevRange.end, activeFilters) 
    };
  }, [transactions, currentRange, prevRange, activeFilters]);

  // Generate 6 periods history for charts
  const historyData = useMemo(() => {
    const data = [];
    for (let i = -5; i <= 0; i++) {
      const range = getPeriodRange(currentDate, viewMode, i);
      let ing = 0;
      let gas = 0;
      transactions.forEach(t => {
        const d = new Date(t.date);
        if (d >= range.start && d <= range.end) {
          const isInternal = t.tipo_movimiento === 'Movimiento Interno';
          const isInvestment = t.tipo_movimiento === 'Ahorro/Inversión';
          if (t.type === 'ingreso' && !isInternal) ing += Math.abs(t.amount);
          
          if (t.type === 'egreso' && !isInternal && !isInvestment) {
             const catP = t.categoria_principal || 'Sin Clasificar';
             if (activeFilters.length === 0 || activeFilters.includes(catP)) {
                gas += Math.abs(t.amount);
             }
          }
        }
      });
      data.push({
        label: getShortLabel(range.start, viewMode),
        Ingresos: ing,
        Gastos: gas
      });
    }
    return data;
  }, [transactions, currentDate, viewMode, activeFilters]);

  // --- Styles ---
  const neoCard = {
    backgroundColor: '#fff',
    border: '3px solid #000',
    borderRadius: '12px',
    boxShadow: '6px 6px 0px #000',
    padding: '2rem',
    marginBottom: '2rem'
  };

  const neoButton = {
    backgroundColor: '#fff',
    border: '2px solid #000',
    borderRadius: '8px',
    boxShadow: '3px 3px 0px #000',
    cursor: 'pointer',
    fontWeight: 700,
    transition: 'all 0.1s'
  };

  const neoPill = {
    padding: '0.4rem 1rem',
    border: '2px solid #000',
    borderRadius: '2rem',
    fontWeight: 800,
    fontSize: '0.85rem',
    cursor: 'pointer',
    boxShadow: '2px 2px 0px #000',
    transition: 'all 0.1s',
    whiteSpace: 'nowrap' as any
  };

  // --- Components ---

  const renderTrendBadge = (curr: number, prev: number, invertGood: boolean = false) => {
    if (prev === 0) return null;
    const pct = ((curr - prev) / prev) * 100;
    const isPositive = pct >= 0;
    
    const isGood = invertGood ? !isPositive : isPositive;
    const bgColor = isGood ? '#bbf7d0' : '#fecaca'; // pastel green / pastel red
    
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.75rem', backgroundColor: bgColor, border: '2px solid #000', borderRadius: '2rem', fontWeight: 800, fontSize: '0.85rem', color: '#000', boxShadow: '2px 2px 0px #000' }}>
        {isPositive ? <TrendingUp size={16} strokeWidth={3} /> : <TrendingDown size={16} strokeWidth={3} />}
        {Math.abs(pct).toFixed(1)}%
      </div>
    );
  };

  const renderSparkline = (dataKey: 'Ingresos' | 'Gastos', fill: string) => {
    return (
      <div style={{ height: '100px', width: '100%', marginTop: '1rem', position: 'absolute', bottom: 0, left: 0, borderBottomLeftRadius: '9px', borderBottomRightRadius: '9px', overflow: 'hidden', zIndex: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={historyData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <Area type="monotone" dataKey={dataKey} stroke="#000" strokeWidth={3} fill={fill} fillOpacity={1} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // BLOCK 1: PERIOD SELECTOR & FILTERS
  const renderHeader = () => {
    const availableCats = stats.current.availableCats;

    return (
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h1 style={{ margin: 0, fontFamily: 'serif', fontSize: '2.5rem', fontWeight: 900, color: '#000' }}>Resumen Financiero</h1>
          
          <div style={{ ...neoButton, display: 'flex', alignItems: 'center', padding: '0.25rem', backgroundColor: '#fff' }}>
            <button onClick={() => shiftPeriod(-1)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={20} strokeWidth={3} />
            </button>
            <div style={{ minWidth: '150px', textAlign: 'center', fontWeight: 800, fontSize: '1.1rem', textTransform: 'capitalize', margin: '0 1rem' }}>
              {getPeriodLabel(currentDate, viewMode)}
            </div>
            <button onClick={() => shiftPeriod(1)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={20} strokeWidth={3} />
            </button>
            <div style={{ width: '2px', height: '24px', backgroundColor: '#000', margin: '0 0.5rem' }}></div>
            <select 
              value={viewMode} 
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              style={{ padding: '0.5rem', border: 'none', backgroundColor: 'transparent', outline: 'none', cursor: 'pointer', fontWeight: 800, appearance: 'none', paddingRight: '1rem' }}
            >
              <option value="month">Mensual</option>
              <option value="quarter">Trimestral</option>
              <option value="year">Anual</option>
            </select>
          </div>
        </div>

        {/* Category Filters Bar */}
        {availableCats.length > 0 && (
          <div style={{ backgroundColor: '#fff', border: '3px solid #000', borderRadius: '12px', padding: '1rem', boxShadow: '4px 4px 0px #000', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ fontWeight: 900, fontSize: '0.9rem', textTransform: 'uppercase', color: '#000' }}>
              Analizar Estas Categorías:
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {availableCats.map(cat => {
                const isActive = activeFilters.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleFilter(cat)}
                    style={{
                      ...neoPill,
                      backgroundColor: isActive ? '#93c5fd' : '#f1f5f9',
                      color: '#000'
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
              {activeFilters.length > 0 && (
                <button
                  onClick={() => setActiveFilters([])}
                  style={{
                    ...neoPill,
                    backgroundColor: '#fecaca',
                    marginLeft: 'auto'
                  }}
                >
                  Limpiar Filtros
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // BLOCK 2: INTELLIGENCE REPORT
  const renderIntelligenceReport = () => {
    const { balance, maxIncomeDesc, maxIncomeAmount, maxRecurringDesc, maxRecurringTotal, maxRecurringCount } = stats.current.insights;
    const ingresos = stats.current.ingresos;
    
    const isDeficit = balance < 0;
    const incomePercent = ingresos > 0 ? Math.round((maxIncomeAmount / ingresos) * 100) : 0;

    return (
      <div style={{ backgroundColor: '#fff', border: '3px solid #000', borderRadius: '12px', padding: '2rem', boxShadow: '6px 6px 0px #000', marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.8rem', margin: '0 0 2rem 0', fontFamily: 'serif', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles fill="#fde047" color="#000" size={28} strokeWidth={2} />
          Reporte de Inteligencia
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Balance Insight */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ backgroundColor: isDeficit ? '#fecaca' : '#bbf7d0', padding: '1rem', borderRadius: '50%', border: '3px solid #000', flexShrink: 0 }}>
              <Activity size={24} strokeWidth={3} />
            </div>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.5 }}>
              Tu balance actual indica un <span style={{ backgroundColor: isDeficit ? '#fecaca' : '#bbf7d0', padding: '0.2rem 0.5rem', border: '2px solid #000', borderRadius: '4px', fontWeight: 900, whiteSpace: 'nowrap' }}>{isDeficit ? 'DÉFICIT' : 'SUPERÁVIT'}</span> de <strong>${Math.abs(balance).toLocaleString('es-CL')}</strong>. 
              {isDeficit ? ' Presta atención, tus gastos están superando a tus ingresos en este periodo.' : ' ¡Excelente trabajo manteniendo tus gastos por debajo de tus ingresos!'}
            </p>
          </div>

          {/* Income Motor Insight */}
          {maxIncomeAmount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ backgroundColor: '#bfdbfe', padding: '1rem', borderRadius: '50%', border: '3px solid #000', flexShrink: 0 }}>
                <Wallet size={24} strokeWidth={3} />
              </div>
              <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.5 }}>
                Tu motor principal de ingresos es <strong>"{maxIncomeDesc}"</strong>, el cual representa el <span style={{ backgroundColor: '#bfdbfe', padding: '0.2rem 0.5rem', border: '2px solid #000', borderRadius: '4px', fontWeight: 900 }}>{incomePercent}%</span> de todas tus entradas de dinero (ingreso real).
              </p>
            </div>
          )}

          {/* Expense Fuga Insight */}
          {maxRecurringTotal > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ backgroundColor: '#fef08a', padding: '1rem', borderRadius: '50%', border: '3px solid #000', flexShrink: 0 }}>
                <Search size={24} strokeWidth={3} />
              </div>
              <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.5 }}>
                Hemos detectado un flujo de capital importante en <strong>"{maxRecurringDesc}"</strong>, con un acumulado de <span style={{ backgroundColor: '#fef08a', padding: '0.2rem 0.5rem', border: '2px solid #000', borderRadius: '4px', fontWeight: 900 }}>${maxRecurringTotal.toLocaleString('es-CL')}</span> repartido en {maxRecurringCount} {maxRecurringCount === 1 ? 'pago' : 'pagos'}.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // BLOCK 3: MAIN NUMBERS
  const renderMainNumbers = () => {
    const c = stats.current;
    const p = stats.prev;

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
        {/* Ingresos */}
        <div style={{ ...neoCard, position: 'relative', overflow: 'hidden', paddingBottom: '6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ backgroundColor: '#bbf7d0', padding: '0.5rem', borderRadius: '50%', border: '2px solid #000' }}>
                <Wallet size={24} strokeWidth={2.5} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, fontFamily: 'serif' }}>Ingresos</h3>
            </div>
            {renderTrendBadge(c.ingresos, p.ingresos, false)}
          </div>
          <p style={{ margin: 0, fontSize: '3.5rem', fontWeight: 900, position: 'relative', zIndex: 10, letterSpacing: '-1px' }}>
            ${c.ingresos.toLocaleString('es-CL')}
          </p>
          {renderSparkline('Ingresos', '#dcfce7')}
        </div>

        {/* Gastos */}
        <div style={{ ...neoCard, position: 'relative', overflow: 'hidden', paddingBottom: '6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ backgroundColor: '#fecaca', padding: '0.5rem', borderRadius: '50%', border: '2px solid #000' }}>
                <CreditCard size={24} strokeWidth={2.5} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, fontFamily: 'serif' }}>Gastos {activeFilters.length > 0 ? '(Filtrados)' : ''}</h3>
            </div>
            {renderTrendBadge(c.gastos, p.gastos, true)}
          </div>
          <p style={{ margin: 0, fontSize: '3.5rem', fontWeight: 900, position: 'relative', zIndex: 10, letterSpacing: '-1px' }}>
            ${c.gastos.toLocaleString('es-CL')}
          </p>
          {renderSparkline('Gastos', '#fee2e2')}
        </div>
      </div>
    );
  };

  // BLOCK 4: FUENTES DE INGRESO (TABLE)
  const renderIncomeSources = () => {
    const c = stats.current;
    const totalEntradas = c.ingresos + c.aportePropio;
    if (totalEntradas === 0) return null;

    const data = [
      { name: 'Sueldo', value: c.sueldo },
      { name: 'Honorarios', value: c.honorarios },
      { name: 'Otros Ingresos', value: c.ingresosOtros },
      { name: 'Aporte Propio', value: c.aportePropio, isGray: true }
    ];

    return (
      <div style={neoCard}>
        <h2 style={{ fontSize: '1.6rem', margin: '0 0 1.5rem 0', fontFamily: 'serif', fontWeight: 900 }}>
          Fuentes de Entrada
        </h2>
        
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '3px solid #000', borderRadius: '8px', overflow: 'hidden', display: 'table' }}>
          <thead>
            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '3px solid #000' }}>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: 900, borderRight: '2px solid #000' }}>Concepto</th>
              <th style={{ padding: '1rem', textAlign: 'right', fontWeight: 900 }}>Monto</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.name} style={{ borderBottom: i === data.length - 1 ? 'none' : '2px solid #000', backgroundColor: row.isGray ? '#f8fafc' : '#fff' }}>
                <td style={{ padding: '1rem', fontWeight: 700, borderRight: '2px solid #000', color: row.isGray ? '#64748b' : '#000' }}>
                  {row.name}
                </td>
                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 800, fontSize: '1.1rem', color: row.isGray ? '#64748b' : '#000' }}>
                  ${row.value.toLocaleString('es-CL')}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: '#bbf7d0', borderTop: '3px solid #000' }}>
              <td style={{ padding: '1rem', fontWeight: 900, borderRight: '2px solid #000' }}>Total Entradas</td>
              <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 900, fontSize: '1.2rem' }}>
                ${totalEntradas.toLocaleString('es-CL')}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  // BLOCK 5: TOP CATEGORIAS (TOGGLE + BAR CHART)
  const renderTopCategories = () => {
    const c = stats.current;
    if (c.gastos === 0) return null;

    const sourceData = categoryLevel === 'principal' ? c.topCatsPrincipal : c.topCatsSecundaria;
    const data = sourceData.slice(0, 8).map(cat => ({
      name: cat.name,
      amount: cat.amount
    }));

    return (
      <div style={neoCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.6rem', margin: 0, fontFamily: 'serif', fontWeight: 900 }}>Análisis de Gasto</h2>
          
          <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: '#f1f5f9', padding: '0.5rem', borderRadius: '12px', border: '3px solid #000' }}>
            <button 
              onClick={() => setCategoryLevel('principal')}
              style={{ ...neoButton, padding: '0.5rem 1rem', border: 'none', boxShadow: 'none', backgroundColor: categoryLevel === 'principal' ? '#fde047' : 'transparent', borderRight: categoryLevel === 'principal' ? '2px solid #000' : 'none' }}
            >
              Principal
            </button>
            <div style={{ width: '2px', backgroundColor: '#000' }}></div>
            <button 
              onClick={() => setCategoryLevel('secundaria')}
              style={{ ...neoButton, padding: '0.5rem 1rem', border: 'none', boxShadow: 'none', backgroundColor: categoryLevel === 'secundaria' ? '#67e8f9' : 'transparent' }}
            >
              Secundaria
            </button>
          </div>
        </div>
        
        <div style={{ height: `${Math.max(300, data.length * 50)}px`, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={140} 
                tick={{ fill: '#000', fontSize: 13, fontWeight: 800 }} 
                axisLine={{ stroke: '#000', strokeWidth: 3 }} 
                tickLine={false} 
              />
              <Tooltip 
                cursor={{ fill: '#f1f5f9' }}
                contentStyle={{ borderRadius: '8px', border: '3px solid #000', boxShadow: '4px 4px 0px #000', fontWeight: 800 }}
                formatter={(value: any) => ['$' + Number(value).toLocaleString('es-CL'), 'Monto']}
              />
              <Bar 
                dataKey="amount" 
                fill="#f43f5e" 
                barSize={32}
                radius={0}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.name === 'Sin Clasificar' ? '#fcd34d' : ['#f43f5e', '#a78bfa', '#34d399', '#60a5fa', '#fb923c'][index % 5]} 
                    stroke="#000"
                    strokeWidth={3}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  // BLOCK 6: UNCLASSIFIED ALERT
  const renderUnclassifiedAlert = () => {
    const count = stats.current.unclassifiedCount;
    if (count === 0) return null;

    return (
      <div style={{ backgroundColor: '#fef08a', border: '3px solid #000', borderRadius: '12px', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '2.5rem', boxShadow: '4px 4px 0px #000' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ backgroundColor: '#fff', padding: '0.75rem', borderRadius: '50%', border: '2px solid #000' }}>
            <AlertTriangle color="#000" size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', color: '#000', fontSize: '1.2rem', fontWeight: 900 }}>Tienes {count} {count === 1 ? 'movimiento' : 'movimientos'} sin clasificar</h4>
            <p style={{ margin: 0, color: '#000', fontWeight: 600, fontSize: '0.9rem' }}>
              Clasifícalos para mejorar la precisión del reporte.
            </p>
          </div>
        </div>
        <a href="/transactions" style={{ backgroundColor: '#000', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', fontWeight: 800, textDecoration: 'none', border: '2px solid #000', transition: 'all 0.1s' }}>
          Clasificar Ahora
        </a>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '4rem', padding: '0 1rem', paddingTop: '2rem' }}>
      {renderHeader()}
      
      {transactions.length === 0 ? (
        <div style={{ backgroundColor: 'white', textAlign: 'center', padding: '6rem 2rem', border: '3px dashed #000', borderRadius: '12px', boxShadow: '6px 6px 0px #000' }}>
          <h2 style={{ fontSize: '2rem', margin: '0 0 1rem 0', fontFamily: 'serif', fontWeight: 900 }}>Aún no tienes movimientos cargados</h2>
          <p style={{ marginBottom: '2rem', fontSize: '1.1rem', fontWeight: 600 }}>
            Importa tus cartolas bancarias para comenzar a analizar.
          </p>
          <a href="/import" style={{ ...neoButton, textDecoration: 'none', display: 'inline-block', padding: '1rem 2rem', fontSize: '1.1rem' }}>Importar Transacciones</a>
        </div>
      ) : (
        <>
          {renderIntelligenceReport()}
          {renderUnclassifiedAlert()}
          {renderMainNumbers()}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem' }}>
            <div>
              {renderIncomeSources()}
            </div>
            <div>
              {renderTopCategories()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
