import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  PiggyBank, Wallet, CreditCard, AlertTriangle
} from 'lucide-react';
import { 
  AreaChart, Area, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';

type ViewMode = 'month' | 'quarter' | 'year';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const { user } = useAuth();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');

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
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.6rem', backgroundColor: isGood ? '#dcfce7' : '#fee2e2', color: isGood ? '#166534' : '#991b1b', borderRadius: '2rem', fontWeight: 700, fontSize: '0.85rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        {Math.abs(pct).toFixed(1)}%
      </div>
    );
  };

  const renderSparkline = (dataKey: 'Ingresos' | 'Gastos' | 'Ahorro', color: string) => {
    const gradientId = `color${dataKey}`;
    return (
      <div style={{ height: '80px', width: '100%', marginTop: '0.5rem', position: 'absolute', bottom: 0, left: 0, opacity: 0.8, pointerEvents: 'none', borderBottomLeftRadius: '1.5rem', borderBottomRightRadius: '1.5rem', overflow: 'hidden' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={historyData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fillOpacity={1} fill={`url(#${gradientId})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // BLOCK 1: PERIOD SELECTOR
  const renderPeriodSelector = () => {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'white', padding: '0.5rem 1rem', borderRadius: '2rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
          <button onClick={() => shiftPeriod(-1)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
            <ChevronLeft size={20} color="#475569" />
          </button>
          
          <div style={{ minWidth: '160px', textAlign: 'center', fontWeight: 800, fontSize: '1.25rem', textTransform: 'capitalize', color: '#1e293b' }}>
            {getPeriodLabel(currentDate, viewMode)}
          </div>
          
          <button onClick={() => shiftPeriod(1)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
            <ChevronRight size={20} color="#475569" />
          </button>

          <div style={{ width: '1px', height: '24px', backgroundColor: '#e2e8f0', margin: '0 0.5rem' }}></div>
          
          <select 
            value={viewMode} 
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
            style={{ padding: '0.5rem', border: 'none', backgroundColor: 'transparent', outline: 'none', cursor: 'pointer', fontWeight: 700, color: '#475569' }}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        {/* Ingresos */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1.5rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981' }}>
              <Wallet size={20} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#64748b' }}>Ingresos</h3>
            </div>
            {renderTrendBadge(c.ingresos, p.ingresos, false)}
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: '#0f172a', position: 'relative', zIndex: 10, marginBottom: '0.5rem' }}>
            ${c.ingresos.toLocaleString('es-CL')}
          </p>
          {renderSparkline('Ingresos', '#10b981')}
        </div>

        {/* Gastos */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1.5rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f43f5e' }}>
              <CreditCard size={20} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#64748b' }}>Gastos</h3>
            </div>
            {renderTrendBadge(c.gastos, p.gastos, true)}
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: '#0f172a', position: 'relative', zIndex: 10, marginBottom: '0.5rem' }}>
            ${c.gastos.toLocaleString('es-CL')}
          </p>
          {renderSparkline('Gastos', '#f43f5e')}
        </div>

        {/* Ahorro */}
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '1.5rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3b82f6' }}>
              <PiggyBank size={20} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#64748b' }}>Ahorro</h3>
            </div>
            {renderTrendBadge(c.ahorro, p.ahorro, false)}
          </div>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 900, color: '#0f172a', position: 'relative', zIndex: 10, marginBottom: '0.5rem' }}>
            ${c.ahorro.toLocaleString('es-CL')}
          </p>
          {renderSparkline('Ahorro', '#3b82f6')}
        </div>
      </div>
    );
  };

  // BLOCK 3: FUENTES DE INGRESO (DONUT CHART)
  const renderIncomeSources = () => {
    const c = stats.current;
    const totalEntradas = c.ingresos + c.aportePropio;
    if (totalEntradas === 0) return null;

    const data = [
      { name: 'Sueldo/Hon.', value: c.sueldo, color: '#10b981' },
      { name: 'Otros', value: c.ingresosOtros, color: '#34d399' },
      { name: 'Aporte Propio', value: c.aportePropio, color: '#cbd5e1' }
    ].filter(d => d.value > 0);

    return (
      <div style={{ marginBottom: '2rem', backgroundColor: 'white', padding: '2rem', borderRadius: '1.5rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
        <h2 style={{ fontSize: '1.3rem', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e293b' }}>
          Fuentes de Entrada
        </h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ width: '200px', height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => '$' + Number(value).toLocaleString('es-CL')} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data.map(item => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', backgroundColor: item.color, borderRadius: '50%' }}></div>
                  <span style={{ fontWeight: 700, color: item.name === 'Aporte Propio' ? 'var(--text-secondary)' : '#334155' }}>{item.name}</span>
                </div>
                <span style={{ fontWeight: 800, color: item.name === 'Aporte Propio' ? 'var(--text-secondary)' : '#0f172a' }}>
                  ${item.value.toLocaleString('es-CL')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Context Text */}
        <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '1rem', borderLeft: '4px solid #22c55e', marginTop: '1.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, lineHeight: '1.5', color: '#166534' }}>
            De tus <strong>${totalEntradas.toLocaleString('es-CL')}</strong> en entradas este período, 
            <strong style={{ color: '#15803d' }}> ${c.ingresos.toLocaleString('es-CL')}</strong> es ingreso nuevo y 
            <strong style={{ color: '#64748b' }}> ${c.aportePropio.toLocaleString('es-CL')}</strong> es Aporte propio.
          </p>
        </div>
      </div>
    );
  };

  // BLOCK 4: FIJOS VS VARIABLES (DONUT CHART)
  const renderFixedVsVariable = () => {
    const c = stats.current;
    if (c.gastos === 0) return null;
    
    const data = [
      { name: 'Fijos', value: c.fixedExpenses, color: '#0ea5e9' },
      { name: 'Variables', value: c.variableExpenses, color: '#f59e0b' }
    ].filter(d => d.value > 0);

    return (
      <div style={{ marginBottom: '2rem', backgroundColor: 'white', padding: '2rem', borderRadius: '1.5rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
        <h2 style={{ fontSize: '1.3rem', margin: '0 0 1.5rem 0', color: '#1e293b' }}>Estructura de Gasto</h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ width: '200px', height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                  {data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color} 
                      style={{ cursor: 'pointer', outline: 'none' }}
                      onClick={() => setExpandedExpenseType(expandedExpenseType === entry.name.toLowerCase() ? null : entry.name.toLowerCase() as any)}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => '$' + Number(value).toLocaleString('es-CL')} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data.map(item => (
              <div 
                key={item.name} 
                onClick={() => setExpandedExpenseType(expandedExpenseType === item.name.toLowerCase() ? null : item.name.toLowerCase() as any)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '0.5rem', borderRadius: '0.5rem', backgroundColor: expandedExpenseType === item.name.toLowerCase() ? (item.name === 'Fijos' ? '#f0f9ff' : '#fffbeb') : 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', backgroundColor: item.color, borderRadius: '50%' }}></div>
                  <span style={{ fontWeight: 700, color: '#334155' }}>Total {item.name}</span>
                </div>
                <span style={{ fontWeight: 900, color: item.color }}>
                  ${item.value.toLocaleString('es-CL')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Expanded Category Breakdown */}
        {expandedExpenseType && (
          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9' }}>
            <h4 style={{ margin: '0 0 1rem 0', fontWeight: 800, color: '#334155' }}>
              Detalle de Gastos {expandedExpenseType === 'fijo' ? 'Fijos' : 'Variables'}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {c.topCats.filter(cat => {
                const isFijo = cat.name.toLowerCase().includes('fijo') || cat.name.toLowerCase().includes('vivienda');
                return expandedExpenseType === 'fijo' ? isFijo : !isFijo;
              }).map(cat => (
                <div key={cat.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem' }}>
                  <span style={{ fontWeight: 600, color: '#475569' }}>{cat.name}</span>
                  <span style={{ fontWeight: 800, color: '#0f172a' }}>${cat.amount.toLocaleString('es-CL')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // BLOCK 5: TOP CATEGORIAS (HORIZONTAL BAR CHART)
  const renderTopCategories = () => {
    const c = stats.current;
    if (c.gastos === 0) return null;

    const data = c.topCats.slice(0, 6).map(cat => ({
      name: cat.name,
      amount: cat.amount
    }));

    return (
      <div style={{ marginBottom: '2rem', backgroundColor: 'white', padding: '2rem', borderRadius: '1.5rem', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
        <h2 style={{ fontSize: '1.3rem', margin: '0 0 1.5rem 0', color: '#1e293b' }}>Top Categorías de Gasto</h2>
        
        <div style={{ height: `${Math.max(250, data.length * 45)}px`, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={120} 
                tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} 
                axisLine={false} 
                tickLine={false} 
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '0.5rem', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                formatter={(value: any) => ['$' + Number(value).toLocaleString('es-CL'), 'Monto']}
              />
              <defs>
                <linearGradient id="colorBar" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.8}/>
                  <stop offset="100%" stopColor="#e11d48" stopOpacity={1}/>
                </linearGradient>
              </defs>
              <Bar 
                dataKey="amount" 
                fill="url(#colorBar)" 
                radius={4} 
                barSize={24}
                background={{ fill: '#f1f5f9', radius: 4 }}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.name === 'Sin Clasificar' ? '#fbbf24' : 'url(#colorBar)'} />
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
      <div style={{ backgroundColor: '#fff7ed', border: '2px solid #fdba74', borderRadius: '1.5rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '2.5rem', boxShadow: '0 4px 6px -1px rgba(251, 146, 60, 0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ backgroundColor: '#ffedd5', padding: '0.75rem', borderRadius: '50%' }}>
            <AlertTriangle color="#ea580c" size={24} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', color: '#c2410c', fontSize: '1.1rem', fontWeight: 800 }}>Tienes {count} {count === 1 ? 'movimiento' : 'movimientos'} sin clasificar</h4>
            <p style={{ margin: 0, color: '#9a3412', fontWeight: 600, fontSize: '0.9rem' }}>
              Clasifícalos para mejorar la precisión de tus gastos.
            </p>
          </div>
        </div>
        <a href="/transactions" style={{ backgroundColor: '#f97316', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '0.75rem', fontWeight: 800, textDecoration: 'none', boxShadow: '0 2px 4px rgba(249, 115, 22, 0.2)' }}>
          Clasificar
        </a>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '4rem', padding: '0 1rem' }}>
      {renderPeriodSelector()}
      
      {transactions.length === 0 ? (
        <div style={{ backgroundColor: 'white', textAlign: 'center', padding: '6rem 2rem', border: '3px dashed #cbd5e1', borderRadius: '1.5rem' }}>
          <h2 style={{ fontSize: '1.8rem', margin: '0 0 1rem 0', color: '#1e293b' }}>Aún no tienes movimientos cargados</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.1rem', fontWeight: 500 }}>
            Importa tus cartolas bancarias para comenzar.
          </p>
          <a href="/import" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block', borderRadius: '1rem', padding: '0.75rem 2rem', fontWeight: 800 }}>Importar Transacciones</a>
        </div>
      ) : (
        <>
          {renderUnclassifiedAlert()}
          {renderMainNumbers()}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem' }}>
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
