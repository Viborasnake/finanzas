import { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  ChevronRight, TrendingUp, TrendingDown, 
  Wallet, CreditCard, AlertTriangle, Sparkles, Activity, Search, X
} from 'lucide-react';
import { 
  AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid
} from 'recharts';

type CategoryLevel = 'principal' | 'secundaria' | 'detalle';

type DateRange = { start: Date; end: Date; label: string };

const today = new Date();
const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

const PRESETS: { id: string; label: string; range: () => DateRange }[] = [
  { id: 'today', label: 'Hoy', range: () => ({ start: startOfToday, end: endOfToday, label: 'Hoy' }) },
  { id: 'week', label: 'Esta semana', range: () => {
    const d = new Date(); const day = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); mon.setHours(0,0,0,0);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
    return { start: mon, end: sun, label: 'Esta semana' };
  }},
  { id: 'month', label: 'Este mes', range: () => {
    const d = new Date();
    return { start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59), label: d.toLocaleString('es-CL', { month: 'long', year: 'numeric' }) };
  }},
  { id: 'prev_month', label: 'Mes pasado', range: () => {
    const d = new Date(); d.setMonth(d.getMonth()-1);
    return { start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59), label: d.toLocaleString('es-CL', { month: 'long', year: 'numeric' }) };
  }},
  { id: 'year', label: 'Este año', range: () => {
    const y = new Date().getFullYear();
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59), label: y.toString() };
  }},
  { id: 'all', label: 'Todo', range: () => ({ start: new Date(2000, 0, 1), end: new Date(2100, 11, 31, 23, 59, 59), label: 'Todo el tiempo' }) },
];

function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function Dashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const { user } = useAuth();

  // Date Range state
  const [dateRange, setDateRange] = useState<DateRange>(() => PRESETS[2].range()); // This month default
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activePreset, setActivePreset] = useState<string>('month');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const applyPreset = (id: string) => {
    const preset = PRESETS.find(p => p.id === id);
    if (!preset) return;
    const r = preset.range();
    setDateRange(r);
    setActivePreset(id);
    setPickerOpen(false);
  };

  const applyCustomRange = () => {
    if (!customFrom || !customTo) return;
    const start = new Date(customFrom + 'T00:00:00');
    const end = new Date(customTo + 'T23:59:59');
    if (start > end) return;
    const fmt = (d: Date) => d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
    setDateRange({ start, end, label: `${fmt(start)} — ${fmt(end)}` });
    setActivePreset('custom');
    setPickerOpen(false);
  };

  const [categoryLevel, setCategoryLevel] = useState<CategoryLevel>('principal');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [detailsModal, setDetailsModal] = useState<{ isOpen: boolean; title: string; transactions: any[]; } | null>(null);

  const toggleCategory = (name: string) => {
    setSelectedCategories(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  useEffect(() => {
    if (user) fetchTransactions();
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

  const openDetailsModal = (conceptName: string, type: 'ingreso' | 'egreso') => {
    const { start, end } = dateRange;
    const txs = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= start && d <= end && t.type === type;
    });

    let filtered: any[] = [];
    if (type === 'ingreso') {
      filtered = txs.filter(t => {
        const isInternal = t.tipo_movimiento === 'Movimiento Interno';
        const catP = t.categoria_principal?.toLowerCase() || '';
        
        if (conceptName === 'Aporte Propio') return isInternal;
        if (isInternal) return false;
        
        if (conceptName === 'Sueldo') return catP.includes('sueldo');
        if (conceptName === 'Honorarios') return catP.includes('honorarios') || catP.includes('profesionales');
        if (conceptName === 'Otros Ingresos') return !catP.includes('sueldo') && !catP.includes('honorarios') && !catP.includes('profesionales');
        return false;
      });
    } else {
      filtered = txs.filter(t => {
        const isInternal = t.tipo_movimiento === 'Movimiento Interno';
        const isInv = t.tipo_movimiento === 'Ahorro/Inversión';
        const catP = t.categoria_principal || 'Sin Clasificar';
        
        if (conceptName === 'Movimiento Interno') return isInternal;
        if (isInternal || isInv) return false;
        
        if (conceptName === 'Otros Gastos') {
          const sortedCats = [...stats.current.topCatsPrincipal].filter(x => x.name !== 'Sin Clasificar');
          const top3Names = sortedCats.slice(0, 3).map(c => c.name);
          return !top3Names.includes(catP);
        }
        
        return catP === conceptName;
      });
    }
    
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setDetailsModal({
      isOpen: true,
      title: `Detalle: ${conceptName}`,
      transactions: filtered
    });
  };

  // --- Computations ---
  // Current range comes from dateRange state.
  // Previous range = same duration, shifted backwards.
  const { currentRange, prevRange } = useMemo(() => {
    const { start, end } = dateRange;
    const durationMs = end.getTime() - start.getTime();
    return {
      currentRange: { start, end },
      prevRange: {
        start: new Date(start.getTime() - durationMs - 1000),
        end: new Date(start.getTime() - 1000)
      }
    };
  }, [dateRange]);

  const stats = useMemo(() => {
    const calcForRange = (start: Date, end: Date) => {
      let ingresos = 0;
      let aportePropio = 0;
      let sueldo = 0;
      let honorarios = 0;
      let ingresosOtros = 0;
      
      let gastos = 0; // Filtered gastos
      let gastosTotales = 0; // Absolute all gastos (for balance)
      let movimientoInternoGasto = 0;
      
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
          const absAmt = Math.abs(t.amount);
          if (isInternal) {
            movimientoInternoGasto += absAmt;
          } else if (!isInvestment) {
            gastosTotales += absAmt;
            
            const catP = t.categoria_principal || 'Sin Clasificar';
            const catS = t.categoria_secundaria || 'Sin Clasificar';
            
            availableCats.add(catP);
            
            // Intelligence logic
            const desc = (t.description || 'Gasto').toUpperCase();
            if (!recurringExpenses[desc]) recurringExpenses[desc] = { total: 0, count: 0 };
            recurringExpenses[desc].total += absAmt;
            recurringExpenses[desc].count += 1;

            // Accumulate All Gastos
            gastos += absAmt;
            catsPrincipal[catP] = (catsPrincipal[catP] || 0) + absAmt;
            catsSecundaria[catS] = (catsSecundaria[catS] || 0) + absAmt;

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

      // Detalle: group by description
      const catsDetalle: Record<string, number> = {};
      txs.forEach(t => {
        const isInternal = t.tipo_movimiento === 'Movimiento Interno';
        const isInvestment = t.tipo_movimiento === 'Ahorro/Inversión';
        if (t.type === 'egreso' && !isInternal && !isInvestment) {
          const desc = (t.description || t.original_description || 'Sin descripción').trim();
          catsDetalle[desc] = (catsDetalle[desc] || 0) + Math.abs(t.amount);
        }
      });
      const topCatsDetalle = Object.entries(catsDetalle)
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
        movimientoInternoGasto,
        topCatsPrincipal,
        topCatsSecundaria,
        topCatsDetalle,
        unclassifiedCount,
        availableCats: Array.from(availableCats).sort(),
        insights: {
          balance: (ingresos + aportePropio) - gastosTotales,
          maxIncomeDesc,
          maxIncomeAmount,
          maxRecurringDesc,
          maxRecurringTotal,
          maxRecurringCount
        }
      };
    };

    return { 
      current: calcForRange(currentRange.start, currentRange.end), 
      prev: calcForRange(prevRange.start, prevRange.end) 
    };
  }, [transactions, currentRange, prevRange]);

  // Generate 6 buckets history for sparklines (based on dateRange duration)
  const historyData = useMemo(() => {
    const { start, end } = dateRange;
    const durationMs = end.getTime() - start.getTime();
    const data = [];
    for (let i = -5; i <= 0; i++) {
      const bStart = new Date(start.getTime() + i * durationMs);
      const bEnd = new Date(start.getTime() + (i + 1) * durationMs - 1000);
      let ing = 0, gas = 0;
      transactions.forEach(t => {
        const d = new Date(t.date);
        if (d >= bStart && d <= bEnd) {
          const isInternal = t.tipo_movimiento === 'Movimiento Interno';
          const isInvestment = t.tipo_movimiento === 'Ahorro/Inversión';
          if (t.type === 'ingreso' && !isInternal) ing += Math.abs(t.amount);
          if (t.type === 'egreso' && !isInternal && !isInvestment) gas += Math.abs(t.amount);
        }
      });
      data.push({ label: `P${i+6}`, Ingresos: ing, Gastos: gas });
    }
    return data;
  }, [transactions, dateRange]);

  // Generate Timeline Data — bucket by day or month depending on range span
  // If categories are selected, generates dynamic per-category lines instead of Ingresos/Gastos
  const timelineData = useMemo(() => {
    const { start, end } = dateRange;
    const daysSpan = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const byMonth = daysSpan > 60;

    const keys: string[] = [];
    const labels: Record<string, string> = {};

    if (byMonth) {
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth()).padStart(2,'0')}`;
        keys.push(key);
        labels[key] = cur.toLocaleString('es-CL', { month: 'short', year: '2-digit' });
        cur.setMonth(cur.getMonth() + 1);
      }
    } else {
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      while (cur <= end) {
        const key = toInputDate(cur);
        keys.push(key);
        labels[key] = `${cur.getDate()} ${cur.toLocaleString('es-CL', { month: 'short' })}`;
        cur.setDate(cur.getDate() + 1);
      }
    }

    const getKey = (d: Date) => byMonth
      ? `${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}`
      : toInputDate(d);

    if (selectedCategories.length === 0) {
      const data: Record<string, any> = {};
      keys.forEach(k => { data[k] = { label: labels[k], Ingresos: 0, Gastos: 0 }; });
      transactions.forEach(t => {
        const d = new Date(t.date);
        if (d >= start && d <= end) {
          const isInternal = t.tipo_movimiento === 'Movimiento Interno';
          const isInvestment = t.tipo_movimiento === 'Ahorro/Inversión';
          const key = getKey(d);
          if (data[key]) {
            if (t.type === 'ingreso' && !isInternal) data[key].Ingresos += Math.abs(t.amount);
            if (t.type === 'egreso' && !isInternal && !isInvestment) data[key].Gastos += Math.abs(t.amount);
          }
        }
      });
      return Object.values(data);
    } else {
      const data: Record<string, any> = {};
      keys.forEach(k => {
        data[k] = { label: labels[k] };
        selectedCategories.forEach((cat: string) => { data[k][cat] = 0; });
      });
      transactions.forEach(t => {
        const d = new Date(t.date);
        if (d >= start && d <= end) {
          const isInternal = t.tipo_movimiento === 'Movimiento Interno';
          const isInvestment = t.tipo_movimiento === 'Ahorro/Inversión';
          if (t.type === 'egreso' && !isInternal && !isInvestment) {
            const catField = categoryLevel === 'detalle'
              ? (t.description || t.original_description || '').trim()
              : categoryLevel === 'principal'
                ? (t.categoria_principal || 'Sin Clasificar')
                : (t.categoria_secundaria || 'Sin Clasificar');
            if (selectedCategories.includes(catField)) {
              const key = getKey(d);
              if (data[key]) data[key][catField] += Math.abs(t.amount);
            }
          }
        }
      });
      return Object.values(data);
    }
  }, [transactions, dateRange, selectedCategories, categoryLevel]);

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
    padding: '0.75rem 1.5rem',
    backgroundColor: '#000',
    color: '#fff',
    border: '2px solid #000',
    borderRadius: '2rem',
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '4px 4px 0px #000',
    transition: 'all 0.1s'
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

  // BLOCK 1: DATE RANGE PICKER
  const renderHeader = () => {
    const fmt = (d: Date) => d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
    const displayLabel = dateRange.label.length > 30
      ? `${fmt(dateRange.start)} — ${fmt(dateRange.end)}`
      : dateRange.label;

    return (
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h1 style={{ margin: 0, fontFamily: '"Montserrat", sans-serif', fontSize: '2.5rem', fontWeight: 900, color: '#000' }}>Resumen Financiero</h1>

          {/* Date Range Picker Trigger */}
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setPickerOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1.25rem', backgroundColor: '#fff', border: '3px solid #000', borderRadius: '2rem', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '4px 4px 0px #000', transition: 'all 0.1s' }}
            >
              <span style={{ fontSize: '1.1rem' }}>📅</span>
              <span style={{ textTransform: 'capitalize' }}>{displayLabel}</span>
              <ChevronRight size={16} strokeWidth={3} style={{ transform: pickerOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
            </button>

            {/* Dropdown */}
            {pickerOpen && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', backgroundColor: '#fff', border: '3px solid #000', borderRadius: '16px', boxShadow: '6px 6px 0px #000', zIndex: 200, minWidth: '300px', overflow: 'hidden' }}>
                {/* Preset pills */}
                <div style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.6rem', letterSpacing: '0.05em' }}>Accesos rápidos</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {PRESETS.map(p => (
                      <button
                        key={p.id}
                        onClick={() => applyPreset(p.id)}
                        style={{ padding: '0.35rem 0.85rem', border: '2px solid #000', borderRadius: '2rem', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', backgroundColor: activePreset === p.id ? '#fde047' : '#f1f5f9', transition: 'all 0.1s' }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom range */}
                <div style={{ padding: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.6rem', letterSpacing: '0.05em' }}>Rango personalizado</div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.25rem', color: '#64748b' }}>Desde</div>
                      <input
                        type="date"
                        value={customFrom}
                        onChange={e => setCustomFrom(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem 0.75rem', border: '2px solid #000', borderRadius: '8px', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem', outline: 'none' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.25rem', color: '#64748b' }}>Hasta</div>
                      <input
                        type="date"
                        value={customTo}
                        onChange={e => setCustomTo(e.target.value)}
                        style={{ width: '100%', padding: '0.5rem 0.75rem', border: '2px solid #000', borderRadius: '8px', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem', outline: 'none' }}
                      />
                    </div>
                    <button
                      onClick={applyCustomRange}
                      disabled={!customFrom || !customTo}
                      style={{ padding: '0.5rem 1rem', backgroundColor: customFrom && customTo ? '#000' : '#e2e8f0', color: customFrom && customTo ? '#fff' : '#94a3b8', border: '2px solid #000', borderRadius: '8px', fontWeight: 800, fontSize: '0.85rem', cursor: customFrom && customTo ? 'pointer' : 'not-allowed' }}
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // BLOCK 2: INTELLIGENCE REPORT
  const renderIntelligenceReport = () => {
    const { balance, maxIncomeDesc, maxIncomeAmount, maxRecurringDesc, maxRecurringTotal } = stats.current.insights;
    const ingresos = stats.current.ingresos;
    
    const isDeficit = balance < 0;
    const incomePercent = ingresos > 0 ? Math.round((maxIncomeAmount / ingresos) * 100) : 0;

    return (
      <div style={{ backgroundColor: '#fff', border: '3px solid #000', borderRadius: '12px', padding: '1.5rem', boxShadow: '4px 4px 0px #000', marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.2rem', margin: '0 0 1rem 0', fontFamily: '"Montserrat", sans-serif', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles fill="#fde047" color="#000" size={20} strokeWidth={2} />
          Reporte de Inteligencia
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          {/* Balance Insight */}
          <div style={{ padding: '1rem', backgroundColor: isDeficit ? '#fef2f2' : '#f0fdf4', border: '2px solid #000', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <Activity size={20} style={{ color: isDeficit ? '#ef4444' : '#22c55e', marginTop: '0.2rem', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Balance Actual</div>
              <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                {isDeficit ? 'Déficit de ' : 'Superávit de '}
                <span style={{ fontWeight: 900 }}>${Math.abs(balance).toLocaleString('es-CL')}</span>
              </div>
              {stats.current.aportePropio > 0 && (
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, marginTop: '0.2rem' }}>
                  *Incluye aportes propios
                </div>
              )}
            </div>
          </div>

          {/* Income Motor Insight */}
          {maxIncomeAmount > 0 && (
            <div style={{ padding: '1rem', backgroundColor: '#eff6ff', border: '2px solid #000', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <Wallet size={20} style={{ color: '#3b82f6', marginTop: '0.2rem', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Motor de Ingresos</div>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                  <span style={{ fontWeight: 900 }}>{incomePercent}%</span> proviene de "{maxIncomeDesc}"
                </div>
              </div>
            </div>
          )}

          {/* Expense Fuga Insight */}
          {maxRecurringTotal > 0 && (
            <div style={{ padding: '1rem', backgroundColor: '#fefce8', border: '2px solid #000', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <Search size={20} style={{ color: '#eab308', marginTop: '0.2rem', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Flujo de Capital Detectado</div>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>
                  <span style={{ fontWeight: 900 }}>${maxRecurringTotal.toLocaleString('es-CL')}</span> acumulado en "{maxRecurringDesc}"
                </div>
              </div>
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

    // Income Logic
    const totalEntradas = c.ingresos + c.aportePropio;
    const incomeData: { name: string; value: number; isGray?: boolean }[] = [
      { name: 'Sueldo', value: c.sueldo },
      { name: 'Honorarios', value: c.honorarios },
      { name: 'Otros Ingresos', value: c.ingresosOtros },
      { name: 'Aporte Propio', value: c.aportePropio, isGray: true }
    ];

    // Expense Logic
    const sorted = [...c.topCatsPrincipal].filter(x => x.name !== 'Sin Clasificar');
    const top3 = sorted.slice(0, 3);
    const others = sorted.slice(3).reduce((acc, curr) => acc + curr.amount, 0);
    const sinClasificarAmount = c.topCatsPrincipal.find(x => x.name === 'Sin Clasificar')?.amount || 0;
    const totalOtros = others + sinClasificarAmount;
    const totalSalidas = top3.reduce((a, b) => a + b.amount, 0) + totalOtros + c.movimientoInternoGasto;
    
    const expenseData: { name: string; value: number; isGray?: boolean }[] = [
      ...top3.map(cat => ({ name: cat.name, value: cat.amount })),
      ...(totalOtros > 0 ? [{ name: 'Otros Gastos', value: totalOtros }] : []),
      { name: 'Movimiento Interno', value: c.movimientoInternoGasto, isGray: true }
    ];

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
        {/* Ingresos Card */}
        <div style={{ ...neoCard, position: 'relative', overflow: 'hidden', paddingBottom: '7rem', marginBottom: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ backgroundColor: '#bbf7d0', padding: '0.5rem', borderRadius: '50%', border: '2px solid #000' }}>
                <Wallet size={24} strokeWidth={2.5} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, fontFamily: '"Montserrat", sans-serif' }}>Ingresos</h3>
            </div>
            {renderTrendBadge(totalEntradas, p.ingresos + p.aportePropio, false)}
          </div>
          <p style={{ margin: c.aportePropio > 0 ? '0 0 0.25rem 0' : '0 0 2rem 0', fontSize: '3.5rem', fontWeight: 900, position: 'relative', zIndex: 10, letterSpacing: '-1px' }}>
            ${totalEntradas.toLocaleString('es-CL')}
          </p>
          {c.aportePropio > 0 && (
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, marginBottom: '1.5rem', position: 'relative', zIndex: 10 }}>
              *Incluye ${c.aportePropio.toLocaleString('es-CL')} de aportes propios (Mov. Interno)
            </div>
          )}
          
          {totalEntradas > 0 && (
            <div style={{ position: 'relative', zIndex: 10, flex: 1, paddingBottom: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '3px solid #000', borderRadius: '8px', overflow: 'hidden', display: 'table', backgroundColor: 'rgba(255,255,255,0.9)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '3px solid #000' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 900, borderRight: '2px solid #000' }}>Concepto</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 900 }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeData.map((row, i) => (
                    <tr 
                      key={row.name} 
                      onClick={() => openDetailsModal(row.name, 'ingreso')}
                      style={{ borderBottom: i === incomeData.length - 1 ? 'none' : '2px solid #000', backgroundColor: row.isGray ? '#f8fafc' : '#fff', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = row.isGray ? '#f8fafc' : '#fff')}
                    >
                      <td style={{ padding: '0.75rem', fontWeight: 700, borderRight: '2px solid #000', color: row.isGray ? '#64748b' : '#000' }}>{row.name}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: row.isGray ? '#64748b' : '#000' }}>${row.value.toLocaleString('es-CL')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#bbf7d0', borderTop: '3px solid #000' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 900, borderRight: '2px solid #000' }}>Total Entradas</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 900 }}>${totalEntradas.toLocaleString('es-CL')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {renderSparkline('Ingresos', '#dcfce7')}
        </div>

        {/* Gastos Card */}
        <div style={{ ...neoCard, position: 'relative', overflow: 'hidden', paddingBottom: '7rem', marginBottom: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ backgroundColor: '#fecaca', padding: '0.5rem', borderRadius: '50%', border: '2px solid #000' }}>
                <CreditCard size={24} strokeWidth={2.5} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, fontFamily: '"Montserrat", sans-serif' }}>Gastos</h3>
            </div>
            {renderTrendBadge(totalSalidas, p.gastos + p.movimientoInternoGasto, true)}
          </div>
          <p style={{ margin: c.movimientoInternoGasto > 0 ? '0 0 0.25rem 0' : '0 0 2rem 0', fontSize: '3.5rem', fontWeight: 900, position: 'relative', zIndex: 10, letterSpacing: '-1px' }}>
            ${totalSalidas.toLocaleString('es-CL')}
          </p>
          {c.movimientoInternoGasto > 0 && (
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, marginBottom: '1.5rem', position: 'relative', zIndex: 10 }}>
              *Incluye ${c.movimientoInternoGasto.toLocaleString('es-CL')} de movimientos internos
            </div>
          )}
          
          {totalSalidas > 0 && (
            <div style={{ position: 'relative', zIndex: 10, flex: 1, paddingBottom: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '3px solid #000', borderRadius: '8px', overflow: 'hidden', display: 'table', backgroundColor: 'rgba(255,255,255,0.9)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '3px solid #000' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 900, borderRight: '2px solid #000' }}>Concepto</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 900 }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseData.map((row, i) => (
                    <tr 
                      key={row.name} 
                      onClick={() => openDetailsModal(row.name, 'egreso')}
                      style={{ borderBottom: i === expenseData.length - 1 ? 'none' : '2px solid #000', backgroundColor: row.isGray ? '#f8fafc' : '#fff', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = row.isGray ? '#f8fafc' : '#fff')}
                    >
                      <td style={{ padding: '0.75rem', fontWeight: 700, borderRight: '2px solid #000', color: row.isGray ? '#64748b' : '#000' }}>{row.name}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: row.isGray ? '#64748b' : '#000' }}>${row.value.toLocaleString('es-CL')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#fecaca', borderTop: '3px solid #000' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 900, borderRight: '2px solid #000' }}>Total Salidas</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 900 }}>${totalSalidas.toLocaleString('es-CL')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {renderSparkline('Gastos', '#fee2e2')}
        </div>
      </div>
    );
  };



  // BLOCK 5: TOP CATEGORIAS AND TIMELINE (Full width container)
  const CATEGORY_COLORS = ['#f43f5e','#a78bfa','#34d399','#60a5fa','#fb923c','#f59e0b','#6366f1','#ec4899','#14b8a6','#84cc16','#e11d48','#7c3aed'];

  const renderAnalysisBlock = () => {
    const c = stats.current;
    if (c.gastos === 0 && c.ingresos === 0) return null;

    const sourceData =
      categoryLevel === 'principal' ? c.topCatsPrincipal
      : categoryLevel === 'secundaria' ? c.topCatsSecundaria
      : c.topCatsDetalle;
    const barData = sourceData.slice(0, 20).map(cat => ({ name: cat.name, amount: cat.amount }));
    const chartTitle = selectedCategories.length > 0
      ? `Línea de Tiempo — ${selectedCategories.join(', ')}`
      : 'Línea de Tiempo (Ingresos vs Gastos)';

    return (
      <div style={{ ...neoCard, marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.6rem', margin: 0, fontFamily: '"Montserrat", sans-serif', fontWeight: 900 }}>Evolución y Análisis de Gasto</h2>
            {selectedCategories.length > 0 && (
              <button onClick={() => setSelectedCategories([])} style={{ marginTop: '0.5rem', fontSize: '0.75rem', fontWeight: 800, background: '#fef08a', border: '2px solid #000', borderRadius: '2rem', padding: '0.25rem 0.75rem', cursor: 'pointer' }}>
                ✕ Limpiar selección ({selectedCategories.length})
              </button>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '0.35rem', borderRadius: '2rem', border: '3px solid #000' }}>
            {(['principal', 'secundaria', 'detalle'] as CategoryLevel[]).map((level, idx, arr) => (
              <>
                <button
                  key={level}
                  onClick={() => { setCategoryLevel(level); setSelectedCategories([]); }}
                  style={{ padding: '0.4rem 1rem', border: 'none', borderRadius: '2rem', boxShadow: 'none', backgroundColor: categoryLevel === level ? (level === 'principal' ? '#fde047' : level === 'secundaria' ? '#67e8f9' : '#bbf7d0') : 'transparent', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem', color: '#000', transition: 'all 0.15s' }}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
                {idx < arr.length - 1 && <div style={{ width: '2px', height: '20px', backgroundColor: '#000', margin: '0 0.1rem' }}></div>}
              </>
            ))}
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '3rem' }}>
          {/* Timeline Chart */}
          <div style={{ height: '350px', width: '100%', display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 800, fontSize: '0.85rem' }}>{chartTitle}</h4>
            {selectedCategories.length === 0 && (
              <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Haz clic en una barra del ranking para ver su evolución en el tiempo →</p>
            )}
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#000', fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: '#000', strokeWidth: 2 }} tickLine={false} dy={10} />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '3px solid #000', boxShadow: '4px 4px 0px #000', fontWeight: 800 }}
                    formatter={(value: any, name: any) => ['$' + Number(value).toLocaleString('es-CL'), name]}
                  />
                  {selectedCategories.length === 0 ? (
                    <>
                      <Line type="monotone" name="Ingresos" dataKey="Ingresos" stroke="#22c55e" strokeWidth={4} dot={{ r: 3, fill: '#bbf7d0', stroke: '#000', strokeWidth: 2 }} activeDot={{ r: 6, stroke: '#000', strokeWidth: 3 }} />
                      <Line type="monotone" name="Gastos" dataKey="Gastos" stroke="#f43f5e" strokeWidth={4} dot={{ r: 3, fill: '#fecaca', stroke: '#000', strokeWidth: 2 }} activeDot={{ r: 6, stroke: '#000', strokeWidth: 3 }} />
                    </>
                  ) : (
                    selectedCategories.map((cat, i) => (
                      <Line key={cat} type="monotone" name={cat} dataKey={cat} stroke={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} strokeWidth={3} dot={{ r: 3, fill: '#fff', stroke: CATEGORY_COLORS[i % CATEGORY_COLORS.length], strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    ))
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart - Ranking Top 20 clickable */}
          {barData.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontWeight: 800 }}>Ranking de Gastos <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#64748b' }}>— clic para comparar</span></h4>
              <div style={{ overflowY: 'auto', maxHeight: '350px', paddingRight: '0.5rem' }}>
                {barData.map((entry, index) => {
                  const isSelected = selectedCategories.includes(entry.name);
                  const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
                  const maxAmt = barData[0]?.amount || 1;
                  const pct = Math.round((entry.amount / maxAmt) * 100);
                  return (
                    <div
                      key={entry.name}
                      onClick={() => toggleCategory(entry.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', cursor: 'pointer', opacity: selectedCategories.length > 0 && !isSelected ? 0.4 : 1, transition: 'opacity 0.2s' }}
                    >
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, border: '2px solid #000', flexShrink: 0 }}></div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, width: '130px', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={entry.name}>{entry.name}</div>
                      <div style={{ flex: 1, height: '20px', backgroundColor: '#f1f5f9', border: '2px solid #000', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: isSelected ? color : color + 'bb', borderRadius: '2px', transition: 'width 0.3s' }}></div>
                        {isSelected && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: '2px solid #000', borderRadius: '4px', boxSizing: 'border-box' }}></div>}
                      </div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, minWidth: '80px', textAlign: 'right' }}>${entry.amount.toLocaleString('es-CL')}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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

  // BLOCK 7: YEARLY CHART (rich version)
  const renderYearlyChart = () => {
    const year = dateRange.start.getFullYear();
    const monthlyData: { mes: string; mesIdx: number; Ingresos: number; AportePropio: number; Gastos: number; Balance: number; tasaAhorro: number }[] = [];

    for (let m = 0; m < 12; m++) {
      const start = new Date(year, m, 1);
      const end = new Date(year, m + 1, 0, 23, 59, 59);
      let ing = 0, aporte = 0, gas = 0;
      transactions.forEach(t => {
        const d = new Date(t.date);
        if (d >= start && d <= end) {
          const isInternal = t.tipo_movimiento === 'Movimiento Interno';
          const isInv = t.tipo_movimiento === 'Ahorro/Inversión';
          if (t.type === 'ingreso') {
            if (isInternal) aporte += Math.abs(t.amount);
            else ing += Math.abs(t.amount);
          }
          if (t.type === 'egreso' && !isInternal && !isInv) gas += Math.abs(t.amount);
        }
      });
      const totalIng = ing + aporte;
      monthlyData.push({
        mes: new Date(year, m, 1).toLocaleString('es-CL', { month: 'short' }),
        mesIdx: m,
        Ingresos: totalIng,
        AportePropio: aporte,
        Gastos: gas,
        Balance: totalIng - gas,
        tasaAhorro: totalIng > 0 ? Math.round(((totalIng - gas) / totalIng) * 100) : 0
      });
    }

    const hasData = monthlyData.some(d => d.Ingresos > 0 || d.Gastos > 0);
    if (!hasData) return null;

    const totalIng = monthlyData.reduce((a, d) => a + d.Ingresos, 0);
    const totalGas = monthlyData.reduce((a, d) => a + d.Gastos, 0);
    const totalBal = totalIng - totalGas;
    const tasaAnual = totalIng > 0 ? Math.round(((totalIng - totalGas) / totalIng) * 100) : 0;

    const monthsWithData = monthlyData.filter(d => d.Ingresos > 0 || d.Gastos > 0);
    const bestMonth = monthsWithData.reduce((best, d) => d.Balance > best.Balance ? d : best, monthsWithData[0]);
    const worstMonth = monthsWithData.reduce((worst, d) => d.Balance < worst.Balance ? d : worst, monthsWithData[0]);

    const kpiStyle: React.CSSProperties = {
      flex: 1, padding: '1rem 1.25rem', border: '2px solid #000', borderRadius: '12px',
      display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '120px'
    };

    // Custom bar tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
      if (!active || !payload?.length) return null;
      const d = monthlyData.find(m => m.mes === label);
      if (!d) return null;
      return (
        <div style={{ backgroundColor: '#fff', border: '3px solid #000', borderRadius: '10px', boxShadow: '4px 4px 0px #000', padding: '0.75rem 1rem', fontWeight: 700, fontSize: '0.85rem', minWidth: '160px' }}>
          <div style={{ fontWeight: 900, fontSize: '1rem', marginBottom: '0.5rem', textTransform: 'capitalize' }}>{label}. {year}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#22c55e' }}>
            <span>↑ Ingresos</span><span>${d.Ingresos.toLocaleString('es-CL')}</span>
          </div>
          {d.AportePropio > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#16a34a', fontSize: '0.75rem' }}>
              <span>└ Aportes Propios</span><span>${d.AportePropio.toLocaleString('es-CL')}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#f43f5e' }}>
            <span>↓ Gastos</span><span>${d.Gastos.toLocaleString('es-CL')}</span>
          </div>
          <div style={{ borderTop: '2px solid #000', marginTop: '0.4rem', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', color: d.Balance >= 0 ? '#22c55e' : '#f43f5e', fontWeight: 900 }}>
            <span>Balance</span><span>{d.Balance >= 0 ? '+' : ''}{d.Balance.toLocaleString('es-CL')}</span>
          </div>
          {d.Ingresos > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#6366f1', marginTop: '0.2rem' }}>
              <span>Tasa ahorro</span><span>{d.tasaAhorro}%</span>
            </div>
          )}
        </div>
      );
    };

    return (
      <div style={{ ...neoCard, marginBottom: '2rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.6rem', margin: '0 0 0.2rem 0', fontFamily: '"Montserrat", sans-serif', fontWeight: 900 }}>Resumen Anual {year}</h2>
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>Visión completa mes a mes · haz hover para más detalle</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {bestMonth && (
              <div style={{ padding: '0.35rem 0.85rem', backgroundColor: '#dcfce7', border: '2px solid #000', borderRadius: '2rem', fontSize: '0.78rem', fontWeight: 800 }}>
                🏆 Mejor: {bestMonth.mes} (+${bestMonth.Balance.toLocaleString('es-CL')})
              </div>
            )}
            {worstMonth && worstMonth.Balance < 0 && (
              <div style={{ padding: '0.35rem 0.85rem', backgroundColor: '#fecaca', border: '2px solid #000', borderRadius: '2rem', fontSize: '0.78rem', fontWeight: 800 }}>
                📉 Peor: {worstMonth.mes} ({worstMonth.Balance.toLocaleString('es-CL')})
              </div>
            )}
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ ...kpiStyle, backgroundColor: '#f0fdf4' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>Total Ingresos</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#15803d' }}>${totalIng.toLocaleString('es-CL')}</span>
          </div>
          <div style={{ ...kpiStyle, backgroundColor: '#fef2f2' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>Total Gastos</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#dc2626' }}>${totalGas.toLocaleString('es-CL')}</span>
          </div>
          <div style={{ ...kpiStyle, backgroundColor: totalBal >= 0 ? '#eff6ff' : '#fef2f2' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>Balance Neto</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: totalBal >= 0 ? '#1d4ed8' : '#dc2626' }}>{totalBal >= 0 ? '+' : ''}${totalBal.toLocaleString('es-CL')}</span>
          </div>
          <div style={{ ...kpiStyle, backgroundColor: '#faf5ff' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>Tasa de Ahorro</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: tasaAnual >= 20 ? '#7c3aed' : tasaAnual >= 0 ? '#6366f1' : '#dc2626' }}>{tasaAnual}%</span>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700 }}>{tasaAnual >= 20 ? 'Excelente 🎯' : tasaAnual >= 10 ? 'Bien 👍' : tasaAnual >= 0 ? 'Ajustado ⚠️' : 'Déficit 🔴'}</span>
          </div>
        </div>

        {/* Chart */}
        <div style={{ height: '260px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fill: '#000', fontSize: 12, fontWeight: 800, fontFamily: 'Montserrat' }}
                axisLine={{ stroke: '#000', strokeWidth: 2 }}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)', radius: 4 }} />
              <Bar dataKey="Ingresos" fill="#22c55e" stroke="#000" strokeWidth={1.5} radius={[6, 6, 0, 0]} maxBarSize={40} />
              <Bar dataKey="Gastos" fill="#f43f5e" stroke="#000" strokeWidth={1.5} radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Balance mini bars */}
        <div style={{ marginTop: '1rem', borderTop: '2px solid #f1f5f9', paddingTop: '1rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>Balance mensual</div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '40px' }}>
            {monthlyData.map((d) => {
              const maxAbs = Math.max(...monthlyData.map(m => Math.abs(m.Balance)), 1);
              const pct = Math.abs(d.Balance) / maxAbs;
              const h = Math.max(4, Math.round(pct * 36));
              return (
                <div key={d.mes} title={`${d.mes}: ${d.Balance >= 0 ? '+' : ''}${d.Balance.toLocaleString('es-CL')}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '40px', cursor: 'default' }}>
                  <div style={{ width: '100%', height: `${h}px`, backgroundColor: d.Balance >= 0 ? '#22c55e' : '#f43f5e', border: '1.5px solid #000', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            {monthlyData.map(d => (
              <div key={d.mes} style={{ flex: 1, textAlign: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8' }}>{d.mes.charAt(0).toUpperCase()}</div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '4rem', padding: '0 1rem', paddingTop: '2rem' }}>
      {renderHeader()}
      
      {transactions.length === 0 ? (
        <div style={{ backgroundColor: 'white', textAlign: 'center', padding: '6rem 2rem', border: '3px dashed #000', borderRadius: '12px', boxShadow: '6px 6px 0px #000' }}>
          <h2 style={{ fontSize: '2rem', margin: '0 0 1rem 0', fontFamily: '"Montserrat", sans-serif', fontWeight: 900 }}>Aún no tienes movimientos cargados</h2>
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
          {renderAnalysisBlock()}
          {renderYearlyChart()}
        </>
      )}

      {/* Details Modal */}
      {detailsModal && detailsModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }} onClick={() => setDetailsModal(null)}>
          <div style={{ backgroundColor: '#fff', border: '3px solid #000', borderRadius: '12px', boxShadow: '8px 8px 0px #000', width: '100%', maxWidth: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '3px solid #000', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: '9px 9px 0 0' }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, fontFamily: '"Montserrat", sans-serif' }}>{detailsModal.title}</h2>
              <button onClick={() => setDetailsModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
                <X size={24} strokeWidth={3} />
              </button>
            </div>
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, backgroundColor: '#fff', borderRadius: '0 0 9px 9px' }}>
              {detailsModal.transactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#64748b' }}>No hay movimientos para este concepto.</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 800, fontSize: '0.9rem', color: '#475569' }}>Fecha</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 800, fontSize: '0.9rem', color: '#475569' }}>Descripción</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, fontSize: '0.9rem', color: '#475569' }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailsModal.transactions.map((t, i) => (
                      <tr key={t.id} style={{ borderBottom: i === detailsModal.transactions.length - 1 ? 'none' : '1px solid #e2e8f0', backgroundColor: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{t.date}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.9rem', fontWeight: 500 }}>{t.description || t.original_description || 'Sin descripción'}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: t.type === 'ingreso' ? '#16a34a' : '#000' }}>
                          ${Math.abs(t.amount).toLocaleString('es-CL')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
