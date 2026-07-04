import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  Wallet, CreditCard, AlertTriangle
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
      let sueldo = 0;
      let honorarios = 0;
      let ingresosOtros = 0;
      let gastos = 0;
      
      const catsPrincipal: Record<string, number> = {};
      const catsSecundaria: Record<string, number> = {};
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
            
            const catP = t.categoria_principal?.toLowerCase() || '';
            if (catP.includes('sueldo')) {
              sueldo += t.amount;
            } else if (catP.includes('honorarios') || catP.includes('profesionales')) {
              honorarios += t.amount;
            } else {
              ingresosOtros += t.amount;
            }
          }
        } else {
          // Gasto
          if (!isInternal && !isInvestment) {
            gastos += Math.abs(t.amount);
            
            const catP = t.categoria_principal || 'Sin Clasificar';
            const catS = t.categoria_secundaria || 'Sin Clasificar';
            
            catsPrincipal[catP] = (catsPrincipal[catP] || 0) + Math.abs(t.amount);
            catsSecundaria[catS] = (catsSecundaria[catS] || 0) + Math.abs(t.amount);

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

      return {
        ingresos,
        aportePropio,
        sueldo,
        honorarios,
        ingresosOtros,
        gastos,
        topCatsPrincipal,
        topCatsSecundaria,
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
        Gastos: gas
      });
    }
    return data;
  }, [transactions, currentDate, viewMode]);

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

  // BLOCK 1: PERIOD SELECTOR
  const renderPeriodSelector = () => {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <div style={{ ...neoButton, display: 'flex', alignItems: 'center', padding: '0.25rem' }}>
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
    );
  };

  // BLOCK 2: MAIN NUMBERS
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
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, fontFamily: 'serif' }}>Gastos</h3>
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

  // BLOCK 3: FUENTES DE INGRESO (TABLE)
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

  // BLOCK 4: TOP CATEGORIAS (TOGGLE + BAR CHART)
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

  // BLOCK 5: UNCLASSIFIED ALERT
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
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '4rem', padding: '0 1rem' }}>
      {renderPeriodSelector()}
      
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
