import { useEffect, useState, useMemo } from 'react';
import { Eye, EyeOff, Calendar } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  
  type PeriodType = 'month' | 'quarter' | 'semester' | 'year' | 'all';
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
  const [filterPeriod, setFilterPeriod] = useState<string>(new Date().getMonth() + 1 + '');
  const [hiddenPrincipals, setHiddenPrincipals] = useState<string[]>([]);

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
    }
  };

  const availableYears = useMemo(() => {
    const years = new Set(transactions.map(t => new Date(t.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);



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
    let servicioDeuda = 0;
    let apoyoFamiliar = 0;
    
    baseTransactions.forEach(t => {
      const isInternal = t.tipo_movimiento === 'Movimiento Interno';
      const isAhorro = t.tipo_movimiento === 'Ahorro/Inversión';
      
      const isApoyoFamiliar = t.categoria_principal === 'Pago a Familiar';
      const isServicioDeuda = t.categoria_principal === 'Servicio de Deuda';
      const isGastoReal = t.tipo_movimiento === 'Gasto Real' && !isApoyoFamiliar && !isServicioDeuda;

      if (t.type === 'ingreso') {
        ingresosBrutos += t.amount;
        if (!isInternal) ingresosReales += t.amount;
        else movimientosInternosIngreso += t.amount;
      } else {
        egresosTotales += t.amount;
        if (isGastoReal) egresosReales += t.amount;
        if (isAhorro) ahorro += t.amount;
        if (isInternal) movimientosInternosEgreso += t.amount;
        if (isServicioDeuda) servicioDeuda += t.amount;
        if (isApoyoFamiliar) apoyoFamiliar += t.amount;
      }
    });

    const balanceReal = ingresosReales - egresosReales - servicioDeuda - apoyoFamiliar;
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
            const isApoyoFamiliar = t.categoria_principal === 'Pago a Familiar';
            const isServicioDeuda = t.categoria_principal === 'Servicio de Deuda';
            const isGastoReal = t.tipo_movimiento === 'Gasto Real' && !isApoyoFamiliar && !isServicioDeuda;

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
      servicioDeuda, apoyoFamiliar,
      balanceReal, balanceFlujoCaja,
      prevIngresosReales, prevEgresosReales, prevIngresosBrutos, prevEgresosTotales, hasPrevData, prevLabel, prevPeriodTransactions
    };
  };

  const getChartData = () => {
    let targetTransactions = baseTransactions;

    if (filterYear !== 'all' || (filterPeriod !== 'all' && periodType !== 'year' && periodType !== 'all')) {
      let endY = filterYear === 'all' ? new Date().getFullYear() : parseInt(filterYear);
      let pType = periodType;
      let pVal = filterPeriod;
      
      if (filterYear !== 'all' && filterPeriod === 'all' && periodType === 'all') {
        pType = 'year';
        pVal = endY.toString();
      } else if (filterPeriod === 'all') {
        pType = 'year';
        pVal = new Date().getFullYear().toString();
      }

      targetTransactions = baseTransactions.filter(t => {
        const date = new Date(t.date);
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        
        if (filterYear !== 'all' && y !== endY) return false;
        
        if (pType === 'year') return true;
        if (pType === 'month') return m.toString() === pVal;
        if (pType === 'quarter') return "Q" + Math.ceil(m / 3) === pVal;
        if (pType === 'semester') return "H" + (m <= 6 ? 1 : 2) === pVal;
        
        return true;
      });
    }

    const currentCats: Record<string, number> = {};
    let unclassifiedSum = 0;

    targetTransactions.forEach(t => {
      const isApoyoFamiliar = t.categoria_principal === 'Pago a Familiar';
      const isServicioDeuda = t.categoria_principal === 'Servicio de Deuda';
      
      if (t.type === 'egreso' && t.tipo_movimiento === 'Gasto Real' && !isApoyoFamiliar && !isServicioDeuda) {
        const principal = t.categoria_principal || 'Sin Clasificar';
        if (principal === 'Sin Clasificar') {
          unclassifiedSum += t.amount;
        } else {
          currentCats[principal] = (currentCats[principal] || 0) + t.amount;
        }
      }
    });

    const arr = Object.entries(currentCats).map(([name, total]) => ({ name, total }));
    arr.sort((a, b) => b.total - a.total);
    
    if (unclassifiedSum > 0 || arr.length > 0) {
      arr.unshift({ name: 'Sin Clasificar', total: unclassifiedSum });
    }

    return arr;
  };

  const renderCuadro1 = () => {
    return (
      <div className="card" style={{ marginBottom: '2rem', border: '2px solid black', backgroundColor: 'var(--bg-color)', boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>CUADRO 1 — RESUMEN REAL</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontWeight: 600 }}>Balance = Ingreso Real − Gasto Real − Deuda − Apoyo Familiar</p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#f0f0f0', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '2px solid black' }}>
            <Calendar size={20} />
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
                    <option key={"m" + (i+1)} value={(i+1).toString()}>{new Date(2000, i, 1).toLocaleString('es-CL', { month: 'short' })}</option>
                  ))}
                  {periodType === 'quarter' && [1, 2, 3, 4].map(q => <option key={"q" + q} value={"Q" + q}>Q{q}</option>)}
                  {periodType === 'semester' && [1, 2].map(h => <option key={"h" + h} value={"H" + h}>H{h}</option>)}
                </select>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontWeight: 600 }}>Ingreso Real</p>
            <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>${ingresosReales.toLocaleString('es-CL')}</p>
          </div>
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontWeight: 600 }}>(−) Gasto Real</p>
            <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)' }}>${egresosReales.toLocaleString('es-CL')}</p>
          </div>
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontWeight: 600 }}>(−) Servicio de Deuda</p>
            <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--warning)' }}>${servicioDeuda.toLocaleString('es-CL')}</p>
          </div>
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontWeight: 600 }}>(−) Apoyo Familiar</p>
            <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#f97316' }}>${apoyoFamiliar.toLocaleString('es-CL')}</p>
          </div>
        </div>

        <div style={{ borderTop: '2px dashed black', paddingTop: '1.5rem' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '1.2rem' }}>BALANCE REAL</p>
          <p style={{ fontSize: '3.5rem', fontWeight: 900, margin: 0, color: balanceReal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            ${balanceReal.toLocaleString('es-CL')}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginTop: '2rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: 'var(--radius-sm)' }}>
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem' }}>Ahorro/Inversión (Informativo)</p>
            <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#3b82f6' }}>${ahorro.toLocaleString('es-CL')}</p>
          </div>
          <div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.9rem' }}>Movimiento Interno (Informativo)</p>
            <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#8b5cf6' }}>${movimientosInternosEgreso.toLocaleString('es-CL')}</p>
          </div>
        </div>
      </div>
    );
  };

  const renderCuadro2 = () => {
    const list = chartData;
    const totalGastoReal = egresosReales; 

    return (
      <div className="card" style={{ border: '2px solid black', backgroundColor: 'var(--bg-color)', boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', marginTop: 0 }}>CUADRO 2 — GASTO REAL POR CATEGORÍA</h2>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'var(--primary-light)', borderBottom: '2px solid black' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Categoría</th>
                <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Monto</th>
                <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>% sobre total</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'center' }}>Ocultar</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item: any, i: number) => {
                const isHidden = hiddenPrincipals.includes(item.name);
                const isUnclassified = item.name === 'Sin Clasificar';
                const pct = totalGastoReal > 0 ? ((item.total / totalGastoReal) * 100).toFixed(1) : "0.0";
                
                return (
                  <tr 
                    key={item.name} 
                    style={{ 
                      borderBottom: i < list.length - 1 ? '1px solid #e5e7eb' : 'none',
                      backgroundColor: isUnclassified ? '#fee2e2' : 'transparent',
                      border: isUnclassified ? '2px solid var(--danger)' : undefined,
                      opacity: isHidden ? 0.5 : 1,
                      transition: 'opacity 0.2s'
                    }} 
                  >
                    <td style={{ padding: '1rem', borderRight: '1px solid #e5e7eb', fontWeight: isUnclassified ? 800 : 600, color: isUnclassified ? 'var(--danger)' : 'inherit', textDecoration: isHidden ? 'line-through' : 'none' }}>
                      {item.name}
                    </td>
                    <td style={{ padding: '1rem', borderRight: '1px solid #e5e7eb', fontWeight: 700, textDecoration: isHidden ? 'line-through' : 'none' }}>
                      ${item.total.toLocaleString('es-CL')}
                    </td>
                    <td style={{ padding: '1rem', borderRight: '1px solid #e5e7eb', fontWeight: 600 }}>
                      <span style={{ 
                        backgroundColor: isUnclassified ? 'var(--danger)' : 'var(--text-color)', 
                        color: isUnclassified ? 'white' : 'var(--bg-color)', 
                        padding: '0.2rem 0.5rem', 
                        borderRadius: '12px', 
                        fontSize: '0.75rem', 
                        fontWeight: 800
                      }}>
                        {pct}%
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      {!isUnclassified && (
                        <button
                          onClick={() => setHiddenPrincipals(prev => 
                            prev.includes(item.name) ? prev.filter(c => c !== item.name) : [...prev, item.name]
                          )}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: isHidden ? 'var(--text-secondary)' : 'var(--text-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%'
                          }}
                          title={isHidden ? "Mostrar en total" : "Ocultar del total"}
                        >
                          {isHidden ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderCuadro3 = () => {
    const interes = baseTransactions.filter(t => t.categoria_secundaria === 'Interés Línea de Crédito').reduce((sum, t) => sum + t.amount, 0);
    const abono = baseTransactions.filter(t => t.categoria_secundaria === 'Abono Línea de Crédito').reduce((sum, t) => sum + t.amount, 0);
    const otros = baseTransactions.filter(t => t.categoria_principal === 'Servicio de Deuda' && t.categoria_secundaria !== 'Interés Línea de Crédito' && t.categoria_secundaria !== 'Abono Línea de Crédito').reduce((sum, t) => sum + t.amount, 0);
    
    return (
      <div className="card" style={{ border: '2px solid black', backgroundColor: 'var(--bg-color)', boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)', height: '100%' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>CUADRO 3 — SERVICIO DE DEUDA</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <span style={{ fontWeight: 600 }}>Interés Línea de Crédito</span>
            <span style={{ fontWeight: 700 }}>${interes.toLocaleString('es-CL')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
            <span style={{ fontWeight: 600 }}>Abono Línea de Crédito</span>
            <span style={{ fontWeight: 700 }}>${abono.toLocaleString('es-CL')}</span>
          </div>
          {otros > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
              <span style={{ fontWeight: 600 }}>Otros (Créditos)</span>
              <span style={{ fontWeight: 700 }}>${otros.toLocaleString('es-CL')}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0.5rem', marginTop: '0.5rem', borderTop: '2px solid black' }}>
            <span style={{ fontWeight: 800 }}>Total Deuda</span>
            <span style={{ fontWeight: 900, fontSize: '1.2rem', color: 'var(--warning)' }}>${(interes + abono + otros).toLocaleString('es-CL')}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderCuadro4 = () => {
    const list = baseTransactions.filter(t => t.tipo_movimiento === 'Movimiento Interno' || t.categoria_principal === 'Pago a Familiar');
    return (
      <div className="card" style={{ border: '2px solid black', backgroundColor: 'var(--bg-color)', boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)', height: '100%' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>CUADRO 4 — NO ES GASTO</h2>
        
        <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
          {list.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No hay movimientos en este período.</p>
          ) : (
            list.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: '1rem' }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.description}</div>
                  <div style={{ fontSize: '0.8rem', color: t.tipo_movimiento === 'Movimiento Interno' ? '#8b5cf6' : '#f97316', fontWeight: 700 }}>
                    {t.tipo_movimiento === 'Movimiento Interno' ? 'Mov. Interno' : 'Apoyo Familiar'}
                  </div>
                </div>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  ${t.amount.toLocaleString('es-CL')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const { 
    ingresosReales, egresosReales, ahorro, movimientosInternosEgreso,
    servicioDeuda, apoyoFamiliar,
    balanceReal
  } = calculateSummary();
  
  const chartData = getChartData();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', paddingBottom: '4rem', maxWidth: '1200px', margin: '0 auto' }}>
      
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
          {renderCuadro1()}
          <div className="card" style={{ backgroundColor: 'white', textAlign: 'center', padding: '4rem 2rem' }}>
            <h2 style={{ fontSize: '1.5rem', margin: '0 0 1rem 0' }}>No hay movimientos registrados en este período</h2>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontWeight: 500 }}>Prueba seleccionando otro rango de fechas en los filtros superiores.</p>
          </div>
        </>
      ) : (
        <>
          {renderCuadro1()}
          {renderCuadro2()}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
            {renderCuadro3()}
            {renderCuadro4()}
          </div>
        </>
      )}
    </div>
  );
}
