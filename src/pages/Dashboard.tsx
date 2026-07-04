import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  PiggyBank, Wallet, CreditCard, AlertTriangle, 
  ChevronDown, ChevronUp
} from 'lucide-react';
import { 
  LineChart, Line, Tooltip, ResponsiveContainer, XAxis
} from 'recharts';

type ViewMode = 'month' | 'quarter' | 'year';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const { user } = useAuth();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  const [expandedMetric, setExpandedMetric] = useState<'ingresos' | 'gastos' | 'ahorro' | null>(null);
  const [expandedExpenseType, setExpandedExpenseType] = useState<'fijo' | 'variable' | null>(null);

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

  // --- Computations ---
  const { currentRange, prevRange } = useMemo(() => {
    return {
      currentRange: getPeriodRange(currentDate, viewMode, 0),
      prevRange: getPeriodRange(currentDate, viewMode, -1)
    };
  }, [currentDate, viewMode]);

  const stats = useMemo(() => {
    const calcForRange = (start: Date, end: Date) => {
      let ingresos = 0;
      let aportePropio = 0;
      let ingresosOtros = 0;
      let gastos = 0;
      let fixedExpenses = 0;
      let variableExpenses = 0;
      
      const cats: Record<string, number> = {};
      let unclassifiedCount = 0;

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
          }
        } else {
          // Gasto
          if (!isInternal && !isInvestment) {
            gastos += Math.abs(t.amount);
            
            const cat = t.categoria_principal || 'Sin Clasificar';
            cats[cat] = (cats[cat] || 0) + Math.abs(t.amount);

            if (cat.toLowerCase().includes('fijo') || cat.toLowerCase().includes('vivienda')) {
              fixedExpenses += Math.abs(t.amount);
            } else {
              variableExpenses += Math.abs(t.amount);
            }

            if (isUnclassified) unclassifiedCount++;
          }
        }
      });

      // Income sources breakdown
      const sueldo = txs.filter(t => t.type === 'ingreso' && !t.tipo_movimiento?.includes('Interno') && (t.categoria_principal === 'Sueldo' || t.categoria_principal === 'Honorarios' || t.categoria_principal === 'Ingresos Profesionales' || t.categoria_principal?.includes('Sueldo'))).reduce((sum, t) => sum + t.amount, 0);
      ingresosOtros = ingresos - sueldo;

      const topCats = Object.entries(cats)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);

      return {
        ingresos,
        aportePropio,
        sueldo,
        ingresosOtros,
        gastos,
        ahorro: ingresos - gastos,
        fixedExpenses,
        variableExpenses,
        topCats,
        unclassifiedCount
      };
    };

    return { 
      current: calcForRange(currentRange.start, currentRange.end), 
      prev: calcForRange(prevRange.start, prevRange.end) 
    };
  }, [transactions, currentRange, prevRange]);

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
          if (t.type === 'egreso' && !isInternal && !isInvestment) gas += Math.abs(t.amount);
        }
      });
      data.push({
        label: getShortLabel(range.start, viewMode),
        Ingresos: ing,
        Gastos: gas,
        Ahorro: ing - gas
      });
    }
    return data;
  }, [transactions, currentDate, viewMode]);

  // --- Components ---

  const renderTrendBadge = (curr: number, prev: number, invertGood: boolean = false) => {
    if (prev === 0) return null;
    const pct = ((curr - prev) / prev) * 100;
    const isPositive = pct >= 0;
    
    // Si invertGood = true (gastos), entonces un aumento es malo (rojo).
    // Si invertGood = false (ingresos/ahorro), un aumento es bueno (verde).
    const isGood = invertGood ? !isPositive : isPositive;
    
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', backgroundColor: isGood ? '#dcfce7' : '#fee2e2', color: isGood ? '#166534' : '#991b1b', borderRadius: '1rem', fontWeight: 700, fontSize: '0.85rem' }}>
        {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {Math.abs(pct).toFixed(1)}%
      </div>
    );
  };

  const renderMiniChart = (dataKey: 'Ingresos' | 'Gastos' | 'Ahorro', color: string) => {
    return (
      <div style={{ height: '120px', width: '100%', marginTop: '1.5rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
        <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Tendencia últimos 6 períodos</p>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={historyData}>
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Tooltip formatter={(value: any) => '$' + Number(value).toLocaleString('es-CL')} labelStyle={{ color: 'black' }} />
            <XAxis dataKey="label" hide />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // BLOCK 1: PERIOD SELECTOR
  const renderPeriodSelector = () => {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'white', padding: '0.5rem 1rem', borderRadius: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
          <button onClick={() => shiftPeriod(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={24} />
          </button>
          
          <div style={{ minWidth: '150px', textAlign: 'center', fontWeight: 800, fontSize: '1.2rem', textTransform: 'capitalize' }}>
            {getPeriodLabel(currentDate, viewMode)}
          </div>
          
          <button onClick={() => shiftPeriod(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={24} />
          </button>

          <div style={{ width: '1px', height: '24px', backgroundColor: '#e5e7eb', margin: '0 0.5rem' }}></div>
          
          <select 
            value={viewMode} 
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
            style={{ padding: '0.5rem', border: 'none', backgroundColor: 'transparent', outline: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            <option value="month">Mensual</option>
            <option value="quarter">Trimestral</option>
            <option value="year">Anual</option>
          </select>
        </div>
      </div>
    );
  };

  // BLOCK 2: THREE MAIN NUMBERS
  const renderMainNumbers = () => {
    const c = stats.current;
    const p = stats.prev;

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Ingresos */}
        <div 
          onClick={() => setExpandedMetric(expandedMetric === 'ingresos' ? null : 'ingresos')}
          style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#16a34a' }}>
              <Wallet size={20} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Ingresos</h3>
            </div>
            {renderTrendBadge(c.ingresos, p.ingresos, false)}
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-color)' }}>
            ${c.ingresos.toLocaleString('es-CL')}
          </p>
          {expandedMetric === 'ingresos' && renderMiniChart('Ingresos', '#16a34a')}
        </div>

        {/* Gastos */}
        <div 
          onClick={() => setExpandedMetric(expandedMetric === 'gastos' ? null : 'gastos')}
          style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626' }}>
              <CreditCard size={20} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Gastos</h3>
            </div>
            {renderTrendBadge(c.gastos, p.gastos, true)}
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-color)' }}>
            ${c.gastos.toLocaleString('es-CL')}
          </p>
          {expandedMetric === 'gastos' && renderMiniChart('Gastos', '#dc2626')}
        </div>

        {/* Ahorro */}
        <div 
          onClick={() => setExpandedMetric(expandedMetric === 'ahorro' ? null : 'ahorro')}
          style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#2563eb' }}>
              <PiggyBank size={20} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Ahorro</h3>
            </div>
            {renderTrendBadge(c.ahorro, p.ahorro, false)}
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-color)' }}>
            ${c.ahorro.toLocaleString('es-CL')}
          </p>
          {expandedMetric === 'ahorro' && renderMiniChart('Ahorro', '#2563eb')}
        </div>
      </div>
    );
  };

  // BLOCK 3: FUENTES DE INGRESO
  const renderIncomeSources = () => {
    const c = stats.current;
    const totalEntradas = c.ingresos + c.aportePropio;
    if (totalEntradas === 0) return null;

    const sueldoPct = (c.sueldo / totalEntradas) * 100;
    const otrosPct = (c.ingresosOtros / totalEntradas) * 100;
    const aportePct = (c.aportePropio / totalEntradas) * 100;

    return (
      <div className="card" style={{ marginBottom: '2rem', backgroundColor: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.3rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Fuentes de Entrada
          </h2>
        </div>
        
        {/* Proportional Bar */}
        <div style={{ height: '32px', display: 'flex', width: '100%', borderRadius: '16px', overflow: 'hidden', marginBottom: '2rem' }}>
          {sueldoPct > 0 && <div style={{ width: `${sueldoPct}%`, backgroundColor: '#16a34a', transition: 'width 0.5s' }} title="Sueldo/Honorarios"></div>}
          {otrosPct > 0 && <div style={{ width: `${otrosPct}%`, backgroundColor: '#4ade80', transition: 'width 0.5s' }} title="Otros Ingresos"></div>}
          {aportePct > 0 && <div style={{ width: `${aportePct}%`, backgroundColor: '#cbd5e1', transition: 'width 0.5s' }} title="Aporte Propio"></div>}
        </div>

        {/* Legend */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '16px', height: '16px', backgroundColor: '#16a34a', borderRadius: '4px' }}></div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Sueldo/Hon.</p>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem' }}>${c.sueldo.toLocaleString('es-CL')}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '16px', height: '16px', backgroundColor: '#4ade80', borderRadius: '4px' }}></div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Otros</p>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem' }}>${c.ingresosOtros.toLocaleString('es-CL')}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '16px', height: '16px', backgroundColor: '#cbd5e1', borderRadius: '4px' }}></div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Aporte propio</p>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-secondary)' }}>${c.aportePropio.toLocaleString('es-CL')}</p>
            </div>
          </div>
        </div>

        {/* Context Text */}
        <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem', borderLeft: '4px solid #3b82f6' }}>
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, lineHeight: '1.5' }}>
            De tus <strong>${totalEntradas.toLocaleString('es-CL')}</strong> en entradas este período, 
            <strong style={{ color: '#16a34a' }}> ${c.ingresos.toLocaleString('es-CL')}</strong> es ingreso nuevo y 
            <strong style={{ color: '#64748b' }}> ${c.aportePropio.toLocaleString('es-CL')}</strong> es Aporte propio desde otra cuenta tuya.
          </p>
        </div>
      </div>
    );
  };

  // BLOCK 4: FIJOS VS VARIABLES
  const renderFixedVsVariable = () => {
    const c = stats.current;
    if (c.gastos === 0) return null;
    
    const fixedPct = (c.fixedExpenses / c.gastos) * 100;
    const varPct = (c.variableExpenses / c.gastos) * 100;

    return (
      <div className="card" style={{ marginBottom: '2rem', backgroundColor: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: '1.3rem', margin: '0 0 1.5rem 0' }}>Estructura de Gasto</h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>
              <span style={{ color: '#0ea5e9' }}>Fijos ({fixedPct.toFixed(0)}%)</span>
              <span style={{ color: '#f59e0b' }}>Variables ({varPct.toFixed(0)}%)</span>
            </div>
            <div style={{ height: '24px', display: 'flex', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
              <div 
                onClick={() => setExpandedExpenseType(expandedExpenseType === 'fijo' ? null : 'fijo')}
                style={{ width: `${fixedPct}%`, backgroundColor: '#0ea5e9', cursor: 'pointer', transition: 'opacity 0.2s' }}
                title="Ver Fijos"
              ></div>
              <div 
                onClick={() => setExpandedExpenseType(expandedExpenseType === 'variable' ? null : 'variable')}
                style={{ width: `${varPct}%`, backgroundColor: '#f59e0b', cursor: 'pointer', transition: 'opacity 0.2s' }}
                title="Ver Variables"
              ></div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div 
            onClick={() => setExpandedExpenseType(expandedExpenseType === 'fijo' ? null : 'fijo')}
            style={{ cursor: 'pointer', padding: '0.5rem', borderRadius: '0.5rem', backgroundColor: expandedExpenseType === 'fijo' ? '#f0f9ff' : 'transparent' }}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Total Fijos</p>
            <p style={{ margin: 0, fontWeight: 900, fontSize: '1.2rem', color: '#0ea5e9' }}>${c.fixedExpenses.toLocaleString('es-CL')}</p>
          </div>
          <div 
            onClick={() => setExpandedExpenseType(expandedExpenseType === 'variable' ? null : 'variable')}
            style={{ cursor: 'pointer', padding: '0.5rem', borderRadius: '0.5rem', backgroundColor: expandedExpenseType === 'variable' ? '#fffbeb' : 'transparent', textAlign: 'right' }}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Total Variables</p>
            <p style={{ margin: 0, fontWeight: 900, fontSize: '1.2rem', color: '#f59e0b' }}>${c.variableExpenses.toLocaleString('es-CL')}</p>
          </div>
        </div>

        {/* Expanded Category Breakdown */}
        {expandedExpenseType && (
          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontWeight: 700 }}>
              Detalle de Gastos {expandedExpenseType === 'fijo' ? 'Fijos' : 'Variables'}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {c.topCats.filter(cat => {
                const isFijo = cat.name.toLowerCase().includes('fijo') || cat.name.toLowerCase().includes('vivienda');
                return expandedExpenseType === 'fijo' ? isFijo : !isFijo;
              }).map(cat => (
                <div key={cat.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: '#f8fafc', borderRadius: '4px' }}>
                  <span style={{ fontWeight: 600 }}>{cat.name}</span>
                  <span style={{ fontWeight: 700 }}>${cat.amount.toLocaleString('es-CL')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // BLOCK 5: TOP CATEGORIAS
  const [showAllCategories, setShowAllCategories] = useState(false);
  const renderTopCategories = () => {
    const c = stats.current;
    if (c.gastos === 0) return null;

    const list = showAllCategories ? c.topCats : c.topCats.slice(0, 5);

    return (
      <div className="card" style={{ marginBottom: '2rem', backgroundColor: 'white', padding: '2rem', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
        <h2 style={{ fontSize: '1.3rem', margin: '0 0 1.5rem 0' }}>Top Categorías de Gasto</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {list.map((cat, i) => {
            const pct = (cat.amount / c.gastos) * 100;
            const isUnclassified = cat.name === 'Sin Clasificar';
            const color = isUnclassified ? '#ef4444' : `hsl(${(i * 137) % 360}, 70%, 50%)`;
            
            return (
              <div key={cat.name} style={{ cursor: 'pointer', padding: '0.5rem', borderRadius: '8px', transition: 'background-color 0.2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 700, color: isUnclassified ? '#dc2626' : 'inherit' }}>{cat.name}</span>
                  <span style={{ fontWeight: 800 }}>${cat.amount.toLocaleString('es-CL')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ flex: 1, height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '4px' }}></div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-secondary)', width: '40px', textAlign: 'right' }}>{pct.toFixed(1)}%</span>
                </div>
              </div>
            );
          })}
        </div>

        {c.topCats.length > 5 && (
          <button 
            onClick={() => setShowAllCategories(!showAllCategories)}
            style={{ width: '100%', padding: '0.75rem', marginTop: '1rem', backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}
          >
            {showAllCategories ? <>Ver menos <ChevronUp size={16} /></> : <>Ver todas ({c.topCats.length}) <ChevronDown size={16} /></>}
          </button>
        )}
      </div>
    );
  };

  // BLOCK 6: UNCLASSIFIED ALERT
  const renderUnclassifiedAlert = () => {
    const count = stats.current.unclassifiedCount;
    if (count === 0) return null;

    return (
      <div style={{ backgroundColor: '#fef2f2', border: '2px solid #ef4444', borderRadius: '1rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '2rem', boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ backgroundColor: '#fee2e2', padding: '0.75rem', borderRadius: '50%' }}>
            <AlertTriangle color="#ef4444" size={24} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', color: '#b91c1c', fontSize: '1.1rem' }}>Tienes {count} {count === 1 ? 'movimiento' : 'movimientos'} sin clasificar</h4>
            <p style={{ margin: 0, color: '#991b1b', fontWeight: 500, fontSize: '0.9rem' }}>
              Clasifícalos para mejorar la precisión de tus gastos.
            </p>
          </div>
        </div>
        <a href="/transactions" style={{ backgroundColor: '#ef4444', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 700, textDecoration: 'none' }}>
          Clasificar Ahora
        </a>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '4rem' }}>
      {renderPeriodSelector()}
      
      {transactions.length === 0 ? (
        <div className="card" style={{ backgroundColor: 'white', textAlign: 'center', padding: '6rem 2rem', border: '3px dashed #cbd5e1', borderRadius: '1rem' }}>
          <h2 style={{ fontSize: '1.8rem', margin: '0 0 1rem 0' }}>Aún no tienes movimientos cargados</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.1rem', fontWeight: 500 }}>
            Importa tus cartolas bancarias para comenzar.
          </p>
          <a href="/import" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>Importar Transacciones</a>
        </div>
      ) : (
        <>
          {renderUnclassifiedAlert()}
          {renderMainNumbers()}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
            <div>
              {renderIncomeSources()}
              {renderFixedVsVariable()}
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
