import { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useBanks } from '../contexts/BankContext';

import { 
  ChevronRight, TrendingUp, TrendingDown, 
  Wallet, CreditCard, AlertTriangle, Sparkles, Activity, Search, X, Edit2,
  ArrowUpRight, ArrowDownRight, Scale, PiggyBank, Calendar, Landmark, FileSpreadsheet, Tags, CheckCircle2, Settings, ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  AreaChart, Area,
  Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ComposedChart
} from 'recharts';
import NeoDatePicker from '../components/NeoDatePicker';
import InfoTooltip from '../components/InfoTooltip';
import MindMapChart from '../components/MindMapChart';
import LaikaPet from '../components/LaikaPet';
import { useTaxonomy } from '../hooks/useTaxonomy';
import { AVAILABLE_BANKS } from '../contexts/BankContext';

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
    return { start: new Date(y, 0, 1), end: new Date(), label: y.toString() };
  }},
  { id: 'prev_year', label: 'Año pasado', range: () => {
    const y = new Date().getFullYear() - 1;
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59), label: y.toString() };
  }},
  { id: 'all', label: 'Todo', range: () => ({ start: new Date(2000, 0, 1), end: new Date(2100, 11, 31, 23, 59, 59), label: 'Todo el tiempo' }) },
];

const MIN_CURRENT_MONTH_TRANSACTIONS = 8;

function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
};

const parseMoneyLike = (value: any) => {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return 0;
  const clean = String(value).replace(/[^0-9,-]/g, '');
  const parsed = parseFloat(clean.replace(',', '.'));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getTransactionKind = (tx: any): 'ingreso' | 'egreso' | null => {
  const directType = String(tx.type || tx.tipo || tx.movimiento || '').toLowerCase();
  if (directType.includes('ingreso') || directType.includes('abono') || directType.includes('credit')) return 'ingreso';
  if (directType.includes('egreso') || directType.includes('cargo') || directType.includes('debit') || directType.includes('expense')) return 'egreso';

  const raw = tx.raw_data || {};
  const rawEntries = Object.entries(raw);
  const abonoEntry = rawEntries.find(([key]) => {
    const k = key.toLowerCase();
    return k.includes('abono') || k.includes('haber') || k.includes('deposito') || k.includes('depósito');
  });
  const cargoEntry = rawEntries.find(([key]) => {
    const k = key.toLowerCase();
    return k.includes('cargo') || k.includes('debe') || k.includes('retiro');
  });
  if (abonoEntry && parseMoneyLike(abonoEntry[1]) > 0) return 'ingreso';
  if (cargoEntry && parseMoneyLike(cargoEntry[1]) > 0) return 'egreso';

  const categoryText = `${tx.tipo_movimiento || ''} ${tx.categoria_principal || ''} ${tx.categoria_secundaria || ''}`.toLowerCase();
  if (categoryText.includes('ingreso') || categoryText.includes('sueldo') || categoryText.includes('honorario')) return 'ingreso';
  if (categoryText.includes('egreso') || categoryText.includes('gasto') || categoryText.includes('tarjeta')) return 'egreso';

  const amount = Number(tx.amount || 0);
  if (amount < 0) return 'egreso';
  return 'egreso';
};

const getTransactionAmount = (tx: any) => Math.abs(Number(tx.amount || 0));

const normalizeBankName = (value: any) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const getCanonicalBankId = (bankName: any) => {
  const normalized = normalizeBankName(bankName);
  return AVAILABLE_BANKS.find(bank => normalizeBankName(bank.id) === normalized || normalizeBankName(bank.label) === normalized)?.id || String(bankName || 'Sin banco');
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { activeBank, connectedBanks, dashboardScope } = useBanks();

  const { taxonomy } = useTaxonomy();
  const isConsolidated = dashboardScope === 'all' && connectedBanks.length > 1;
  const dashboardBanks = isConsolidated ? connectedBanks : (activeBank ? [activeBank] : []);
  const activeBankInfo = AVAILABLE_BANKS.find(b => b.id === activeBank);
  const dashboardBankLabel = isConsolidated ? 'Todos los bancos' : (activeBankInfo?.label || 'Sin banco');
  const [reportCollapsed, setReportCollapsed] = useState(() => localStorage.getItem('finanzas_report_collapsed') === 'true');
  const [periodWasChosen, setPeriodWasChosen] = useState(() => sessionStorage.getItem('finanzas_dash_period_chosen') === 'true');

  const [activePreset, setActivePreset] = useState<string>(() => {
    return sessionStorage.getItem('finanzas_dash_preset') || 'month';
  });

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const saved = sessionStorage.getItem('finanzas_dash_range');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { start: new Date(parsed.start), end: new Date(parsed.end), label: parsed.label };
      } catch (e) {}
    }
    const presetId = sessionStorage.getItem('finanzas_dash_preset') || 'month';
    const preset = PRESETS.find(p => p.id === presetId) || PRESETS[2];
    return preset.range();
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setDashboardRange = (id: string, userChosen = false) => {
    const preset = PRESETS.find(p => p.id === id);
    if (!preset) return;
    const r = preset.range();
    setDateRange(r);
    setActivePreset(id);
    setPickerOpen(false);
    sessionStorage.setItem('finanzas_dash_preset', id);
    sessionStorage.setItem('finanzas_dash_range', JSON.stringify(r));
    if (userChosen) {
      setPeriodWasChosen(true);
      sessionStorage.setItem('finanzas_dash_period_chosen', 'true');
    }
  };

  const applyPreset = (id: string) => {
    setDashboardRange(id, true);
  };

  const applyCustomRange = () => {
    if (!customFrom || !customTo) return;
    const start = customFrom;
    const end = new Date(customTo.getFullYear(), customTo.getMonth(), customTo.getDate(), 23, 59, 59);
    if (start > end) return;
    const fmt = (d: Date) => d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
    const r = { start, end, label: `${fmt(start)} — ${fmt(end)}` };
    setDateRange(r);
    setActivePreset('custom');
    setPickerOpen(false);
    sessionStorage.setItem('finanzas_dash_preset', 'custom');
    sessionStorage.setItem('finanzas_dash_range', JSON.stringify(r));
    setPeriodWasChosen(true);
    sessionStorage.setItem('finanzas_dash_period_chosen', 'true');
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
    if (user && dashboardBanks.length > 0) {
      fetchTransactions();
    } else {
      setTransactions([]);
      setLoading(false);
    }
  }, [user, dashboardScope, activeBank, connectedBanks.join('|')]);

  useEffect(() => {
    setPeriodWasChosen(sessionStorage.getItem('finanzas_dash_period_chosen') === 'true');
  }, [dashboardScope, activeBank]);

  useEffect(() => {
    if (loading || transactions.length === 0) return;
    if (periodWasChosen && activePreset !== 'month' && activePreset !== 'prev_month') return;

    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousStart = new Date(previous.getFullYear(), previous.getMonth(), 1);
    const previousEnd = new Date(previous.getFullYear(), previous.getMonth() + 1, 0, 23, 59, 59);

    const realTransactions = transactions.filter(t => !(t.description || '').toLowerCase().includes('saldo inicial'));
    const currentCount = realTransactions.filter(t => {
      const d = parseLocalDate(t.date);
      return d >= currentStart && d <= currentEnd;
    }).length;
    const previousCount = realTransactions.filter(t => {
      const d = parseLocalDate(t.date);
      return d >= previousStart && d <= previousEnd;
    }).length;

    if (currentCount >= MIN_CURRENT_MONTH_TRANSACTIONS) {
      if (activePreset !== 'month') setDashboardRange('month');
      return;
    }

    if (previousCount > 0 && activePreset !== 'prev_month') {
      setDashboardRange('prev_month');
    }
  }, [loading, transactions, periodWasChosen, activePreset]);

  const fetchTransactions = async () => {
    if (!user || dashboardBanks.length === 0) return;
    try {
      setLoading(true);
      if (isConsolidated) {
        const results = await Promise.all(
          dashboardBanks.map(bank =>
            supabase
              .from('transactions')
              .select('*')
              .eq('user_id', user.id)
              .eq('bank', bank)
              .order('date', { ascending: true })
          )
        );

        const firstError = results.find(result => result.error)?.error;
        if (firstError) throw firstError;

        const rows = results.flatMap((result, index) =>
          (result.data || []).map(tx => ({
            ...tx,
            bank: tx.bank || dashboardBanks[index]
          }))
        );
        rows.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
        setTransactions(rows);
      } else {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('bank', dashboardBanks[0])
          .order('date', { ascending: true });

        if (error) throw error;
        setTransactions(data || []);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDetailsModal = (conceptName: string, type: 'ingreso' | 'egreso') => {
    const { start, end } = dateRange;
    const txs = transactions.filter(t => {
      const d = parseLocalDate(t.date);
      return d >= start && d <= end && getTransactionKind(t) === type;
    });

    let filtered: any[] = [];
    if (type === 'ingreso') {
      filtered = txs.filter(t => {
        const isInternal = t.tipo_movimiento === 'Movimiento Interno' || 
                           t.categoria_secundaria === 'Transferencias Propias' || 
                           t.categoria_secundaria === 'Transferencia personal';
        const catP = t.categoria_principal?.toLowerCase() || '';
        
        if (conceptName === 'Ingreso Propio') return isInternal;
        if (isInternal) return false;
        
        if (conceptName === 'Sueldo') return catP.includes('sueldo');
        if (conceptName === 'Honorarios') return catP.includes('honorarios') || catP.includes('profesionales');
        if (conceptName === 'Otros Ingresos') return !catP.includes('sueldo') && !catP.includes('honorarios') && !catP.includes('profesionales');
        return false;
      });
    } else {
      filtered = txs.filter(t => {
        const isInternal = t.tipo_movimiento === 'Movimiento Interno' || 
                           t.categoria_secundaria === 'Transferencias Propias' || 
                           t.categoria_secundaria === 'Transferencia personal';
        const isInv = t.tipo_movimiento === 'Ahorro/Inversión';
        const catP = t.categoria_principal || 'Sin Clasificar';
        
        if (conceptName === 'Egreso Propio') return isInternal;
        if (isInternal || isInv) return false;
        
        if (conceptName === 'Otros Egresos') {
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

  const filteredTransactions = useMemo(() => {
    const { start, end } = dateRange;
    return transactions.filter(t => {
      const d = parseLocalDate(t.date);
      return d >= start && d <= end;
    });
  }, [transactions, dateRange]);

  const isInitialBalanceTx = (t: any) => (t.description || '').toLowerCase().includes('saldo inicial');

  const periodMovements = useMemo(() => {
    return filteredTransactions.filter(t => !isInitialBalanceTx(t));
  }, [filteredTransactions]);

  const availablePeriods = useMemo(() => {
    const months = new Map<string, { start: Date; end: Date; label: string; count: number }>();
    transactions.forEach(t => {
      if (isInitialBalanceTx(t)) return;
      const d = parseLocalDate(t.date);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!months.has(key)) {
        months.set(key, {
          start: new Date(d.getFullYear(), d.getMonth(), 1),
          end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
          label: d.toLocaleString('es-CL', { month: 'long', year: 'numeric' }),
          count: 0
        });
      }
      months.get(key)!.count += 1;
    });
    return Array.from(months.values()).sort((a, b) => b.start.getTime() - a.start.getTime());
  }, [transactions]);

  const closestPeriodWithData = useMemo(() => {
    if (availablePeriods.length === 0) return null;
    const selectedTs = dateRange.start.getTime();
    return [...availablePeriods].sort((a, b) => (
      Math.abs(a.start.getTime() - selectedTs) - Math.abs(b.start.getTime() - selectedTs)
    ))[0];
  }, [availablePeriods, dateRange.start]);

  const applyRangeObject = (range: DateRange) => {
    setDateRange(range);
    setActivePreset('custom');
    setPickerOpen(false);
    setPeriodWasChosen(true);
    sessionStorage.setItem('finanzas_dash_preset', 'custom');
    sessionStorage.setItem('finanzas_dash_range', JSON.stringify(range));
    sessionStorage.setItem('finanzas_dash_period_chosen', 'true');
  };

  const stats = useMemo(() => {
    const calcForRange = (start: Date, end: Date) => {
      let ingresos = 0;
      let aportePropio = 0;
      let sueldo = 0;
      let honorarios = 0;
      let ingresosOtros = 0;
      
      let gastos = 0; // Filtered gastos
      let gastosTotales = 0; // Absolute all gastos (for balance)
      let movimientoInternoEgreso = 0;
      
      const catsPrincipal: Record<string, number> = {};
      const catsSecundaria: Record<string, number> = {};
      let unclassifiedCount = 0;

      const availableCats = new Set<string>();

      let maxIncomeDesc = '';
      let maxIncomeAmount = 0;
      const recurringExpenses: Record<string, { total: number; count: number }> = {};

      const txs = transactions.filter(t => {
        const d = parseLocalDate(t.date);
        return d >= start && d <= end;
      });

      txs.forEach(t => {
        const isInternal = t.tipo_movimiento === 'Movimiento Interno' || 
                           t.categoria_secundaria === 'Transferencias Propias' || 
                           t.categoria_secundaria === 'Transferencia personal';
        const isInvestment = t.tipo_movimiento === 'Ahorro/Inversión';
        const isUnclassified = !t.categoria_principal || t.categoria_principal === 'Sin Clasificar';

        const kind = getTransactionKind(t);
        const amount = getTransactionAmount(t);

        if (kind === 'ingreso') {
          if (isInternal) {
            aportePropio += amount;
          } else {
            ingresos += amount;
            
            const catP = t.categoria_principal?.toLowerCase() || '';
            if (catP.includes('sueldo')) {
              sueldo += amount;
            } else if (catP.includes('honorarios') || catP.includes('profesionales')) {
              honorarios += amount;
            } else {
              ingresosOtros += amount;
            }

            // For intelligence
            if (amount > maxIncomeAmount) {
              maxIncomeAmount = amount;
              maxIncomeDesc = t.description || t.categoria_principal || 'Ingreso';
            }
          }
        } else if (kind === 'egreso') {
          // Gasto
          const absAmt = amount;
          if (isInternal) {
            movimientoInternoEgreso += absAmt;
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

            // Accumulate All Egresos
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
        if (getTransactionKind(t) === 'egreso' && !isInternal && !isInvestment) {
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
        movimientoInternoEgreso,
        topCatsPrincipal,
        topCatsSecundaria,
        topCatsDetalle,
        unclassifiedCount,
        availableCats: Array.from(availableCats).sort(),
        insights: {
          balance: (ingresos + aportePropio) - (gastosTotales + movimientoInternoEgreso),
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

  const bankBreakdown = useMemo(() => {
    const byBank = new Map<string, { bank: string; label: string; color: string; ingresos: number; egresos: number; count: number }>();

    periodMovements.forEach(t => {
      const bankName = getCanonicalBankId(t.bank);
      const bankInfo = AVAILABLE_BANKS.find(b => b.id === bankName);
      if (!byBank.has(bankName)) {
        byBank.set(bankName, {
          bank: bankName,
          label: bankInfo?.label || bankName,
          color: bankInfo?.color || '#94a3b8',
          ingresos: 0,
          egresos: 0,
          count: 0
        });
      }

      const item = byBank.get(bankName)!;
      const amount = getTransactionAmount(t);
      const kind = getTransactionKind(t);
      if (kind === 'ingreso') item.ingresos += amount;
      if (kind === 'egreso') item.egresos += amount;
      item.count += 1;
    });

    return Array.from(byBank.values()).sort((a, b) => (b.ingresos + b.egresos) - (a.ingresos + a.egresos));
  }, [periodMovements]);

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
        const d = parseLocalDate(t.date);
        if (d >= bStart && d <= bEnd) {
          const isInvestment = t.tipo_movimiento === 'Ahorro/Inversión';
          const kind = getTransactionKind(t);
          if (kind === 'ingreso') ing += getTransactionAmount(t);
          if (kind === 'egreso' && !isInvestment) gas += getTransactionAmount(t);
        }
      });
      let label = '';
      const days = Math.round(durationMs / (1000 * 60 * 60 * 24));
      if (days >= 28 && days <= 31) {
        label = bStart.toLocaleString('es-CL', { month: 'short', timeZone: 'UTC' });
      } else if (days > 360) {
        label = bStart.getFullYear().toString();
      } else {
        label = `${bStart.getUTCDate()}/${bStart.getUTCMonth()+1}`;
      }
      data.push({ label, Ingresos: ing, Egresos: gas });
    }
    return data;
  }, [transactions, dateRange]);

  // Generate Timeline Data — bucket by day or month depending on range span
  // If categories are selected, generates dynamic per-category lines instead of Ingresos/Egresos
  const timelineData = useMemo(() => {
    const { start, end: rawEnd } = dateRange;
    const today = new Date();
    const end = rawEnd > today ? today : rawEnd;

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
      keys.forEach(k => { data[k] = { label: labels[k], Ingresos: 0, Egresos: 0 }; });
      transactions.forEach(t => {
        const d = parseLocalDate(t.date);
        if (d >= start && d <= end) {
          const isInvestment = t.tipo_movimiento === 'Ahorro/Inversión';
          const key = getKey(d);
          if (data[key]) {
            const kind = getTransactionKind(t);
            if (kind === 'ingreso') data[key].Ingresos += getTransactionAmount(t);
            if (kind === 'egreso' && !isInvestment) data[key].Egresos += getTransactionAmount(t);
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
        const d = parseLocalDate(t.date);
        if (d >= start && d <= end) {
          const isInvestment = t.tipo_movimiento === 'Ahorro/Inversión';
          if (getTransactionKind(t) === 'egreso' && !isInvestment) {
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
    border: '2px solid #000',
    borderRadius: '12px',
    boxShadow: '4px 4px 0px #000',
    padding: '2rem',
    marginBottom: '2rem'
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

  const renderSparkline = (dataKey: 'Ingresos' | 'Egresos', fill: string) => {
    return (
      <div style={{ height: '100px', width: '100%', marginTop: '1rem', position: 'absolute', bottom: 0, left: 0, borderBottomLeftRadius: '9px', borderBottomRightRadius: '9px', overflow: 'hidden', zIndex: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={historyData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" hide />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '2px solid black', borderRadius: '8px', boxShadow: '4px 4px 0px black', padding: '8px' }}
              itemStyle={{ color: 'black', fontWeight: 900, fontSize: '1.1rem' }}
              labelStyle={{ color: '#64748b', fontWeight: 700, marginBottom: '4px', fontSize: '0.8rem', textTransform: 'capitalize' }}
              formatter={(value: any) => [`$${Number(value).toLocaleString('es-CL')}`, dataKey]}
            />
            <Area type="monotone" dataKey={dataKey} stroke="#000" strokeWidth={3} fill={fill} fillOpacity={1} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderOnboardingWizard = () => {
    const steps = [
      {
        title: 'Banco activo',
        description: dashboardBanks.length > 0 ? `Trabajaremos con ${dashboardBankLabel}.` : 'Elige tu primer banco para separar tus cartolas.',
        icon: <Landmark size={24} strokeWidth={2.5} />,
        action: dashboardBanks.length > 0 ? 'Cambiar banco' : 'Configurar banco',
        path: '/settings#bancos',
        done: dashboardBanks.length > 0,
        color: '#dbeafe'
      },
      {
        title: 'Datos base',
        description: 'Guarda tu RUT para detectar transferencias propias y evitar dobles conteos.',
        icon: <Settings size={24} strokeWidth={2.5} />,
        action: 'Completar datos',
        path: '/settings#deteccion',
        done: false,
        color: '#fef08a'
      },
      {
        title: 'Primera cartola',
        description: 'Carga MACH, Itaú o Scotiabank para crear tus movimientos iniciales.',
        icon: <FileSpreadsheet size={24} strokeWidth={2.5} />,
        action: 'Importar cartola',
        path: '/import',
        done: false,
        color: '#dcfce7'
      },
      {
        title: 'Clasificación',
        description: 'Luego podrás revisar categorías, crear reglas y dejar el dashboard listo.',
        icon: <Tags size={24} strokeWidth={2.5} />,
        action: 'Ver clasificador',
        path: '/transactions',
        done: false,
        color: '#f3e8ff'
      }
    ];

    return (
      <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', boxShadow: '4px 4px 0px #000', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '0', borderBottom: '2px solid #000' }}>
          <div style={{ padding: '2rem', backgroundColor: '#f8fafc' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fef08a', boxShadow: '2px 2px 0px #000', fontSize: '0.75rem', fontWeight: 900, marginBottom: '1.25rem' }}>
              <Sparkles size={16} strokeWidth={3} />
              Primer inicio
            </div>
            <h2 style={{ fontSize: '2.15rem', lineHeight: 1.05, margin: '0 0 1rem 0', fontWeight: 900 }}>Preparemos tu dashboard financiero</h2>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#334155', maxWidth: '640px', marginBottom: '1.5rem' }}>
              Aún no hay movimientos para mostrar. Sigue estos pasos y en pocos minutos tendrás ingresos, egresos, categorías y gráficos funcionando.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                onClick={() => navigate(dashboardBanks.length > 0 ? '/import' : '/settings#bancos')}
                style={{ padding: '0.9rem 1.25rem', fontSize: '0.95rem' }}
              >
                {dashboardBanks.length > 0 ? <FileSpreadsheet size={20} /> : <Landmark size={20} />}
                {dashboardBanks.length > 0 ? 'Importar primera cartola' : 'Configurar banco'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => navigate('/settings#deteccion')}
                style={{ padding: '0.9rem 1.25rem', fontSize: '0.95rem', backgroundColor: '#fff' }}
              >
                <Settings size={20} />
                Revisar configuración
              </button>
            </div>
          </div>

          <div style={{ padding: '2rem', backgroundColor: '#fff', borderLeft: '2px solid #000', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.25rem' }}>
              <LaikaPet pose={dashboardBanks.length > 0 ? 'pointing' : 'welcome'} size={178} title="Laika acompaña el inicio" />
            </div>
            <div style={{ border: '2px solid #000', borderRadius: '10px', boxShadow: '3px 3px 0px #000', padding: '1rem', backgroundColor: '#dbeafe' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 900, color: '#334155', marginBottom: '0.35rem' }}>Banco activo</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem', fontWeight: 900 }}>
                <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: isConsolidated ? 'linear-gradient(135deg, #e63000 0 33%, #f77f00 33% 66%, #a855f7 66% 100%)' : (activeBankInfo ? activeBankInfo.color : '#cbd5e1'), border: '2px solid #000', boxShadow: '1px 1px 0px #000' }} />
                {dashboardBankLabel}
              </div>
            </div>
            <div style={{ border: '2px solid #000', borderRadius: '10px', boxShadow: '3px 3px 0px #000', padding: '1rem', backgroundColor: '#dcfce7' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 900, color: '#334155', marginBottom: '0.35rem' }}>Movimientos</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>0 cargados</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '1rem', padding: '1.25rem' }}>
          {steps.map((step, index) => (
            <button
              key={step.title}
              onClick={() => navigate(step.path)}
              style={{ textAlign: 'left', padding: '1rem', minHeight: '190px', border: '2px solid #000', borderRadius: '10px', boxShadow: '3px 3px 0px #000', backgroundColor: step.color, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ width: '42px', height: '42px', borderRadius: '10px', border: '2px solid #000', backgroundColor: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0px #000' }}>
                  {step.icon}
                </span>
                {step.done ? (
                  <CheckCircle2 size={26} fill="#22c55e" color="#000" strokeWidth={2.5} />
                ) : (
                  <span style={{ width: '30px', height: '30px', borderRadius: '999px', border: '2px solid #000', backgroundColor: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, boxShadow: '2px 2px 0px #000' }}>
                    {index + 1}
                  </span>
                )}
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.35rem 0', fontWeight: 900 }}>{step.title}</h3>
                <p style={{ margin: 0, color: '#1f2937', fontSize: '0.86rem', fontWeight: 600, lineHeight: 1.45 }}>{step.description}</p>
              </div>
              <span style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 900 }}>
                {step.action}
                <ChevronRight size={16} strokeWidth={3} />
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderEmptyPeriodState = () => {
    const periodLabel = dateRange.label || dateRange.start.toLocaleString('es-CL', { month: 'long', year: 'numeric' });
    const nextPeriod = closestPeriodWithData;

    return (
      <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', boxShadow: '4px 4px 0px #000', padding: '2rem', marginBottom: '2.5rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '1.5rem', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.35rem 0.75rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fef08a', boxShadow: '2px 2px 0 #000', fontWeight: 900, fontSize: '0.78rem', marginBottom: '1rem' }}>
            <Search size={16} strokeWidth={3} />
            Sin movimientos en este periodo
          </div>
          <h2 style={{ margin: '0 0 0.6rem 0', fontSize: '1.6rem', fontWeight: 900 }}>
            No hay datos para {periodLabel}
          </h2>
          <p style={{ margin: 0, color: '#475569', fontWeight: 650, lineHeight: 1.5, maxWidth: '640px' }}>
            Este banco tiene movimientos cargados, pero ninguno cae dentro del rango seleccionado. Por eso los gráficos y totales aparecen vacíos.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: '220px' }}>
          {nextPeriod && (
            <button
              className="btn btn-primary"
              onClick={() => applyRangeObject({ start: nextPeriod.start, end: nextPeriod.end, label: nextPeriod.label })}
              style={{ justifyContent: 'center' }}
            >
              Ver {nextPeriod.label}
            </button>
          )}
          <button
            className="btn btn-outline"
            onClick={() => navigate('/import')}
            style={{ justifyContent: 'center', backgroundColor: '#fff' }}
          >
            <FileSpreadsheet size={18} />
            Importar cartola
          </button>
        </div>
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
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1.25rem', backgroundColor: '#fff', border: '2px solid #000', borderRadius: '2rem', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '4px 4px 0px #000', transition: 'all 0.1s' }}
            >
              <Calendar size={20} strokeWidth={2.5} />
              <span style={{ textTransform: 'capitalize' }}>{displayLabel}</span>
              <ChevronRight size={16} strokeWidth={3} style={{ transform: pickerOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
            </button>

            {/* Dropdown */}
            {pickerOpen && (
              <div className="date-popover" style={{ position: 'absolute', top: 'calc(100% + 8px)', backgroundColor: '#fff', border: '2px solid #000', borderRadius: '16px', boxShadow: '4px 4px 0px #000', zIndex: 200, minWidth: '300px' }}>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, marginBottom: '0.5rem', color: '#64748b' }}>DESDE</div>
                        <NeoDatePicker 
                          value={customFrom || dateRange.start}
                          onChange={(d) => setCustomFrom(d)}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 800, marginBottom: '0.5rem', color: '#64748b' }}>HASTA</div>
                        <NeoDatePicker 
                          value={customTo || dateRange.end}
                          onChange={(d) => setCustomTo(d)}
                        />
                      </div>
                    </div>
                    <button
                      onClick={applyCustomRange}
                      disabled={!customFrom || !customTo}
                      style={{ width: '100%', padding: '0.75rem', backgroundColor: customFrom && customTo ? '#000' : '#e2e8f0', color: customFrom && customTo ? '#fff' : '#94a3b8', border: '2px solid #000', borderRadius: '8px', fontWeight: 800, fontSize: '0.9rem', cursor: customFrom && customTo ? 'pointer' : 'not-allowed', transition: 'all 0.1s' }}
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
      <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '1.5rem', boxShadow: '4px 4px 0px #000', marginBottom: '2.5rem' }}>
        <div 
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: reportCollapsed ? '0' : '0 0 1rem 0' }}
          onClick={() => {
            const newVal = !reportCollapsed;
            setReportCollapsed(newVal);
            localStorage.setItem('finanzas_report_collapsed', String(newVal));
          }}
        >
          <h2 style={{ fontSize: '1.2rem', margin: 0, fontFamily: '"Montserrat", sans-serif', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles fill="#fde047" color="#000" size={20} strokeWidth={2} />
            Reporte de Inteligencia
            <InfoTooltip content="Análisis automático de tus finanzas que destaca tu balance, tu principal fuente de ingresos y tu mayor fuga de dinero." />
          </h2>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronDown size={20} strokeWidth={2.5} style={{ transform: reportCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
          </button>
        </div>

        {!reportCollapsed && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '1rem' }}>
          {/* Balance Insight */}
          <div style={{ padding: '1rem', backgroundColor: isDeficit ? '#fef2f2' : '#f0fdf4', border: '2px solid #000', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <Activity size={20} style={{ color: isDeficit ? '#ef4444' : '#22c55e', marginTop: '0.2rem', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
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
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Motor de Ingresos</div>
                <div style={{ fontSize: '1rem', fontWeight: 600, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  <span style={{ fontWeight: 900 }}>{incomePercent}%</span> proviene de "{maxIncomeDesc}"
                </div>
              </div>
            </div>
          )}

          {/* Expense Fuga Insight */}
          {maxRecurringTotal > 0 && (
            <div style={{ padding: '1rem', backgroundColor: '#fefce8', border: '2px solid #000', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <Search size={20} style={{ color: '#eab308', marginTop: '0.2rem', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Flujo de Capital Detectado</div>
                <div style={{ fontSize: '1rem', fontWeight: 600, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  <span style={{ fontWeight: 900 }}>${maxRecurringTotal.toLocaleString('es-CL')}</span> acumulado en "{maxRecurringDesc}"
                </div>
              </div>
            </div>
          )}
        </div>

        {isConsolidated && bankBreakdown.length > 0 && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '2px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', color: '#64748b', marginBottom: '0.75rem', letterSpacing: '0.04em' }}>
              Consolidado por banco
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '0.75rem' }}>
              {bankBreakdown.map(bank => {
                const balance = bank.ingresos - bank.egresos;
                return (
                  <div
                    key={bank.bank}
                    style={{ border: '2px solid #000', borderRadius: '10px', backgroundColor: '#f8fafc', boxShadow: '2px 2px 0 #000', padding: '0.85rem' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.65rem' }}>
                      <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: bank.color, border: '2px solid #000', boxShadow: '1px 1px 0 #000' }} />
                      <strong style={{ fontSize: '0.95rem' }}>{bank.label}</strong>
                      <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 900, color: '#64748b' }}>{bank.count} mov.</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', fontSize: '0.78rem', fontWeight: 800 }}>
                      <span style={{ color: '#15803d' }}>+${bank.ingresos.toLocaleString('es-CL')}</span>
                      <span style={{ color: '#dc2626', textAlign: 'right' }}>-${bank.egresos.toLocaleString('es-CL')}</span>
                    </div>
                    <div style={{ marginTop: '0.45rem', fontWeight: 900, fontSize: '0.92rem' }}>
                      {balance >= 0 ? '+' : '-'}${Math.abs(balance).toLocaleString('es-CL')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
          </>
        )}
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
      { name: 'Ingreso Propio', value: c.aportePropio, isGray: true }
    ];

    // Expense Logic
    const sorted = [...c.topCatsPrincipal].filter(x => x.name !== 'Sin Clasificar');
    const top3 = sorted.slice(0, 3);
    const others = sorted.slice(3).reduce((acc, curr) => acc + curr.amount, 0);
    const sinClasificarAmount = c.topCatsPrincipal.find(x => x.name === 'Sin Clasificar')?.amount || 0;
    const totalOtros = others + sinClasificarAmount;
    const totalSalidas = top3.reduce((a, b) => a + b.amount, 0) + totalOtros + c.movimientoInternoEgreso;
    
    const expenseData: { name: string; value: number; isGray?: boolean }[] = [
      ...top3.map(cat => ({ name: cat.name, value: cat.amount })),
      ...(totalOtros > 0 ? [{ name: 'Otros Egresos', value: totalOtros }] : []),
      { name: 'Egreso Propio', value: c.movimientoInternoEgreso, isGray: true }
    ];

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '2rem', marginBottom: '3rem' }}>
        {/* Ingresos Card */}
        <div style={{ ...neoCard, position: 'relative', overflow: 'hidden', paddingBottom: '7rem', marginBottom: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ backgroundColor: '#bbf7d0', borderRadius: '50%', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '44px', height: '44px' }}>
                <Wallet size={24} strokeWidth={2.5} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, fontFamily: '"Montserrat", sans-serif', display: 'flex', alignItems: 'center' }}>
                Ingresos
                <InfoTooltip content="Total de dinero que ha entrado a tus cuentas. Los traspasos entre tus propias cuentas (Aporte Propio) se desglosan aparte." />
              </h3>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', borderRadius: '8px', overflow: 'hidden', display: 'table', backgroundColor: 'rgba(255,255,255,0.9)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #000' }}>
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
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: row.isGray ? '#64748b' : '#000' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem' }}>
                          ${row.value.toLocaleString('es-CL')}
                          <div className="btn-icon" title="Ver detalles">
                            <Search size={14} strokeWidth={3} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#bbf7d0', borderTop: '2px solid #000' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 900, borderRight: '2px solid #000' }}>Total Entradas</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 900 }}>${totalEntradas.toLocaleString('es-CL')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {renderSparkline('Ingresos', '#dcfce7')}
        </div>

        {/* Egresos Card */}
        <div style={{ ...neoCard, position: 'relative', overflow: 'hidden', paddingBottom: '7rem', marginBottom: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ backgroundColor: '#fecaca', borderRadius: '50%', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '44px', height: '44px' }}>
                <CreditCard size={24} strokeWidth={2.5} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, fontFamily: '"Montserrat", sans-serif', display: 'flex', alignItems: 'center' }}>
                Egresos
                <InfoTooltip content="Dinero que ha salido de tus cuentas. Los traspasos entre tus cuentas y aportes a inversiones (Mov. Interno / Ahorro) no se consideran gastos reales." />
              </h3>
            </div>
            {renderTrendBadge(totalSalidas, p.gastos + p.movimientoInternoEgreso, true)}
          </div>
          <p style={{ margin: c.movimientoInternoEgreso > 0 ? '0 0 0.25rem 0' : '0 0 2rem 0', fontSize: '3.5rem', fontWeight: 900, position: 'relative', zIndex: 10, letterSpacing: '-1px' }}>
            ${totalSalidas.toLocaleString('es-CL')}
          </p>
          {c.movimientoInternoEgreso > 0 && (
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, marginBottom: '1.5rem', position: 'relative', zIndex: 10 }}>
              *Incluye ${c.movimientoInternoEgreso.toLocaleString('es-CL')} de movimientos internos
            </div>
          )}
          
          {totalSalidas > 0 && (
            <div style={{ position: 'relative', zIndex: 10, flex: 1, paddingBottom: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', borderRadius: '8px', overflow: 'hidden', display: 'table', backgroundColor: 'rgba(255,255,255,0.9)' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #000' }}>
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
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: row.isGray ? '#64748b' : '#000' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem' }}>
                          ${row.value.toLocaleString('es-CL')}
                          <div className="btn-icon" title="Ver detalles">
                            <Search size={14} strokeWidth={3} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#fecaca', borderTop: '2px solid #000' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 900, borderRight: '2px solid #000' }}>Total Salidas</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 900 }}>${totalSalidas.toLocaleString('es-CL')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {renderSparkline('Egresos', '#fee2e2')}
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
      : 'Línea de Tiempo (Ingresos vs Egresos)';

    return (
      <div style={{ ...neoCard, marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.6rem', margin: 0, fontFamily: '"Montserrat", sans-serif', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Evolución y Análisis de Gasto
              <InfoTooltip content="Línea de tiempo para ver tus tendencias. Puedes filtrar categorías abajo en el ranking para ver cómo evolucionan ingresos/gastos específicos a lo largo del tiempo." />
            </h2>
            {selectedCategories.length > 0 && (
              <button onClick={() => setSelectedCategories([])} style={{ marginTop: '0.5rem', fontSize: '0.75rem', fontWeight: 800, background: '#fef08a', border: '2px solid #000', borderRadius: '2rem', padding: '0.25rem 0.75rem', cursor: 'pointer' }}>
                ✕ Limpiar selección ({selectedCategories.length})
              </button>
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '0.35rem', borderRadius: '2rem', border: '2px solid #000' }}>
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
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '3rem' }}>
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
                    contentStyle={{ borderRadius: '8px', border: '2px solid #000', boxShadow: '4px 4px 0px #000', fontWeight: 800 }}
                    formatter={(value: any, name: any) => ['$' + Number(value).toLocaleString('es-CL'), name]}
                  />
                  {selectedCategories.length === 0 ? (
                    <>
                      <Line type="monotone" name="Ingresos" dataKey="Ingresos" stroke="#22c55e" strokeWidth={4} dot={{ r: 3, fill: '#bbf7d0', stroke: '#000', strokeWidth: 2 }} activeDot={{ r: 6, stroke: '#000', strokeWidth: 3 }} />
                      <Line type="monotone" name="Egresos" dataKey="Egresos" stroke="#f43f5e" strokeWidth={4} dot={{ r: 3, fill: '#fecaca', stroke: '#000', strokeWidth: 2 }} activeDot={{ r: 6, stroke: '#000', strokeWidth: 3 }} />
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
              <h4 style={{ margin: '0 0 1rem 0', fontWeight: 800, display: 'flex', alignItems: 'center' }}>
                Ranking de Egresos 
                <InfoTooltip content="Las categorías en las que más has gastado o ingresado. Haz clic en cualquiera para graficarla en la línea de tiempo." />
                <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#64748b', marginLeft: '0.5rem' }}>— clic para comparar</span>
              </h4>
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
      <div style={{ backgroundColor: '#fef08a', border: '2px solid #000', borderRadius: '12px', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '2.5rem', boxShadow: '4px 4px 0px #000' }}>
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
    const monthlyData: { mes: string; mesIdx: number; Ingresos: number; AportePropio: number; Egresos: number; Balance: number; tasaAhorro: number }[] = [];

    const today = new Date();
    const maxMonth = year === today.getFullYear() ? today.getMonth() : 11;

    for (let m = 0; m <= maxMonth; m++) {
      const start = new Date(year, m, 1);
      const end = new Date(year, m + 1, 0, 23, 59, 59);
      let ing = 0, aporte = 0, gas = 0;
      transactions.forEach(t => {
        const d = parseLocalDate(t.date);
        if (d >= start && d <= end) {
          const isInternal = t.tipo_movimiento === 'Movimiento Interno';
          const isInv = t.tipo_movimiento === 'Ahorro/Inversión';
          const kind = getTransactionKind(t);
          const amount = getTransactionAmount(t);
          if (kind === 'ingreso') {
            if (isInternal) aporte += amount;
            else ing += amount;
          }
          if (kind === 'egreso' && !isInv) gas += amount;
        }
      });
      // totalIng includes aportePropio as requested
      const totalIng = ing + aporte;
      monthlyData.push({
        mes: new Date(year, m, 1).toLocaleString('es-CL', { month: 'short' }),
        mesIdx: m,
        Ingresos: totalIng,
        AportePropio: aporte,
        Egresos: gas,
        Balance: totalIng - gas,
        tasaAhorro: totalIng > 0 ? Math.round(((totalIng - gas) / totalIng) * 100) : 0
      });
    }

    const hasData = monthlyData.some(d => d.Ingresos > 0 || d.Egresos > 0);
    if (!hasData) return null;

    const totalIng = monthlyData.reduce((a, d) => a + d.Ingresos, 0);
    const totalGas = monthlyData.reduce((a, d) => a + d.Egresos, 0);
    const totalBal = totalIng - totalGas;
    const tasaAnual = totalIng > 0 ? Math.round(((totalIng - totalGas) / totalIng) * 100) : 0;

    const monthsWithData = monthlyData.filter(d => d.Ingresos > 0 || d.Egresos > 0);
    const bestMonth = monthsWithData.reduce((best, d) => d.Balance > best.Balance ? d : best, monthsWithData[0]);
    const worstMonth = monthsWithData.reduce((worst, d) => d.Balance < worst.Balance ? d : worst, monthsWithData[0]);

    const kpiStyle: React.CSSProperties = {
      flex: 1, padding: '1.25rem', border: '2px solid #000', borderRadius: '12px',
      display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '150px',
      boxShadow: '4px 4px 0px #000', position: 'relative', overflow: 'hidden'
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
      if (!active || !payload?.length) return null;
      const d = monthlyData.find(m => m.mes === label);
      if (!d) return null;
      return (
        <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '10px', boxShadow: '4px 4px 0px #000', padding: '1rem', minWidth: '180px' }}>
          <div style={{ fontWeight: 900, fontSize: '1.1rem', marginBottom: '0.75rem', textTransform: 'capitalize', borderBottom: '2px solid #000', paddingBottom: '0.25rem' }}>{label}. {year}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#16a34a', fontWeight: 800 }}>
            <span>Ingresos</span><span>${d.Ingresos.toLocaleString('es-CL')}</span>
          </div>
          {d.AportePropio > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#15803d', fontSize: '0.8rem', fontWeight: 700 }}>
              <span>└ Aportes</span><span>${d.AportePropio.toLocaleString('es-CL')}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#e11d48', fontWeight: 800, marginTop: '0.25rem' }}>
            <span>Egresos</span><span>${d.Egresos.toLocaleString('es-CL')}</span>
          </div>
          <div style={{ borderTop: '2px dashed #94a3b8', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', color: d.Balance >= 0 ? '#16a34a' : '#e11d48', fontWeight: 900, fontSize: '1.1rem' }}>
            <span>Balance</span><span>{d.Balance >= 0 ? '+' : ''}{d.Balance.toLocaleString('es-CL')}</span>
          </div>
        </div>
      );
    };

    return (
      <div style={{ ...neoCard, marginBottom: '2rem', padding: '2rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.8rem', margin: '0 0 0.5rem 0', fontFamily: '"Montserrat", sans-serif', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Resumen Anual {year}
              <InfoTooltip content="Perspectiva global de todo el año. Analiza qué meses te fue mejor y en cuáles gastaste más de lo que ganaste." />
            </h2>
            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Balance de ingresos, gastos y capacidad de ahorro a lo largo del año.</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {bestMonth && (
              <div style={{ padding: '0.5rem 1rem', backgroundColor: '#dcfce7', border: '2px solid #000', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '2px 2px 0px #000' }}>
                <TrendingUp size={16} /> Mejor mes: {bestMonth.mes}
              </div>
            )}
            {worstMonth && worstMonth.Balance < 0 && (
              <div style={{ padding: '0.5rem 1rem', backgroundColor: '#fecaca', border: '2px solid #000', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '2px 2px 0px #000' }}>
                <TrendingDown size={16} /> Peor mes: {worstMonth.mes}
              </div>
            )}
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
          <div style={{ ...kpiStyle, backgroundColor: '#f0fdf4' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: '#16a34a', letterSpacing: '0.05em' }}>Ingresos Totales</span>
              <ArrowUpRight size={20} color="#16a34a" />
            </div>
            <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#15803d' }}>${totalIng.toLocaleString('es-CL')}</span>
          </div>
          
          <div style={{ ...kpiStyle, backgroundColor: '#fef2f2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: '#e11d48', letterSpacing: '0.05em' }}>Egresos Totales</span>
              <ArrowDownRight size={20} color="#e11d48" />
            </div>
            <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#be123c' }}>${totalGas.toLocaleString('es-CL')}</span>
          </div>

          <div style={{ ...kpiStyle, backgroundColor: totalBal >= 0 ? '#eff6ff' : '#fef2f2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: totalBal >= 0 ? '#2563eb' : '#e11d48', letterSpacing: '0.05em', display: 'flex', alignItems: 'center' }}>
                Balance Neto
                <InfoTooltip content="Ingresos totales menos gastos totales. Si es positivo, ganaste más de lo que gastaste." />
              </span>
              <Scale size={20} color={totalBal >= 0 ? '#2563eb' : '#e11d48'} />
            </div>
            <span style={{ fontSize: '1.5rem', fontWeight: 900, color: totalBal >= 0 ? '#1d4ed8' : '#be123c' }}>
              {totalBal >= 0 ? '+' : ''}${totalBal.toLocaleString('es-CL')}
            </span>
          </div>

          <div style={{ ...kpiStyle, backgroundColor: '#faf5ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: '#9333ea', letterSpacing: '0.05em', display: 'flex', alignItems: 'center' }}>
                Tasa Ahorro
                <InfoTooltip content="Porcentaje de tus ingresos que no gastaste. Lo ideal es mantenerla por encima del 20% para unas finanzas saludables." />
              </span>
              <PiggyBank size={20} color="#9333ea" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 900, color: tasaAnual >= 20 ? '#7e22ce' : tasaAnual >= 0 ? '#9333ea' : '#dc2626' }}>{tasaAnual}%</span>
              <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 800 }}>
                {tasaAnual >= 20 ? 'Excelente 🎯' : tasaAnual >= 10 ? 'Bien 👍' : tasaAnual >= 0 ? 'Ajustado ⚠️' : 'Déficit 🔴'}
              </span>
            </div>
          </div>
        </div>

        {/* Composed Chart */}
        <div style={{ height: '320px', position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fill: '#000', fontSize: 12, fontWeight: 800, fontFamily: 'Montserrat' }}
                axisLine={{ stroke: '#000', strokeWidth: 2 }}
                tickLine={false}
                dy={10}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)', radius: 8 }} />
              <Bar dataKey="Ingresos" fill="#4ade80" stroke="#000" strokeWidth={2} radius={[6, 6, 0, 0]} maxBarSize={45} isAnimationActive={true} />
              <Bar dataKey="Egresos" fill="#fb7185" stroke="#000" strokeWidth={2} radius={[6, 6, 0, 0]} maxBarSize={45} isAnimationActive={true} />
              <Area type="monotone" dataKey="Balance" stroke="#2563eb" strokeWidth={4} fill="#60a5fa" fillOpacity={0.3} dot={{ r: 5, fill: '#fff', stroke: '#2563eb', strokeWidth: 3 }} activeDot={{ r: 8, fill: '#2563eb', stroke: '#fff', strokeWidth: 3 }} isAnimationActive={true} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Sleek mini pills */}
        <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', minWidth: '120px' }}>Tendencia Mensual</div>
          <div style={{ display: 'flex', flex: 1, gap: '4px', height: '12px' }}>
            {monthlyData.map((d) => (
              <div 
                key={d.mes} 
                title={`${d.mes}: ${d.Balance >= 0 ? '+' : ''}${d.Balance.toLocaleString('es-CL')}`} 
                style={{ 
                  flex: 1, 
                  height: '100%', 
                  backgroundColor: d.Balance >= 0 ? '#4ade80' : '#fb7185', 
                  borderRadius: '6px',
                  opacity: Math.max(0.3, Math.abs(d.Balance) / Math.max(...monthlyData.map(m => Math.abs(m.Balance)), 1)),
                  transition: 'opacity 0.2s'
                }} 
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '4rem', padding: '0 1rem', paddingTop: '2rem' }}>
      {renderHeader()}
      
      {dashboardBanks.length === 0 ? (
        renderOnboardingWizard()
      ) : loading ? (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div className="skeleton" style={{ height: '150px' }}></div>
            <div className="skeleton" style={{ height: '150px' }}></div>
          </div>
          <div className="skeleton" style={{ height: '400px', marginBottom: '2.5rem' }}></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
            <div className="skeleton" style={{ height: '100px' }}></div>
            <div className="skeleton" style={{ height: '100px' }}></div>
            <div className="skeleton" style={{ height: '100px' }}></div>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        renderOnboardingWizard()
      ) : (
        <>
          {periodMovements.length === 0 ? (
            renderEmptyPeriodState()
          ) : (
            <>
              {renderIntelligenceReport()}
              {renderUnclassifiedAlert()}
              {renderMainNumbers()}
              {renderAnalysisBlock()}
              {renderYearlyChart()}
              <div className="card" style={{ marginTop: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Mapa de Flujo de Dinero</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
                  Visualiza orgánicamente cómo se distribuye tu dinero en este periodo. Los montos se calculan en base a tus movimientos filtrados.
                </p>
                <MindMapChart transactions={filteredTransactions} taxonomy={taxonomy} />
              </div>
            </>
          )}
        </>
      )}

      {/* Details Modal */}
      {detailsModal && detailsModal.isOpen && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backdropFilter: 'blur(4px)' }} onClick={() => setDetailsModal(null)}>
          <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', boxShadow: '4px 4px 0px #000', width: '100%', maxWidth: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '2px solid #000', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: '9px 9px 0 0' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, fontFamily: '"Montserrat", sans-serif' }}>{detailsModal.title}</h2>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginTop: '0.25rem', textTransform: 'capitalize' }}>
                  {dateRange.start.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })} — {dateRange.end.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <button onClick={() => setDetailsModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: '0.5rem' }}>
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
                      {isConsolidated && (
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 800, fontSize: '0.9rem', color: '#475569' }}>Banco</th>
                      )}
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 800, fontSize: '0.9rem', color: '#475569' }}>Descripción</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, fontSize: '0.9rem', color: '#475569' }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailsModal.transactions.map((t, i) => {
                      const bankId = getCanonicalBankId(t.bank);
                      const bankInfo = AVAILABLE_BANKS.find(bank => bank.id === bankId);
                      const bankLabel = bankInfo?.label || bankId;
                      const bankColor = bankInfo?.color || '#94a3b8';

                      return (
                        <tr key={t.id} style={{ borderBottom: i === detailsModal.transactions.length - 1 ? 'none' : '1px solid #e2e8f0', backgroundColor: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          <td style={{ padding: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{t.date}</td>
                          {isConsolidated && (
                            <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.55rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fff', boxShadow: '1px 1px 0 #000', fontSize: '0.72rem', fontWeight: 900 }}>
                                <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: bankColor, border: '1.5px solid #000', flexShrink: 0 }} />
                                {bankLabel}
                              </span>
                            </td>
                          )}
                          <td style={{ padding: '0.75rem', fontSize: '0.9rem', fontWeight: 500 }}>{t.description || t.original_description || 'Sin descripción'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: getTransactionKind(t) === 'ingreso' ? '#16a34a' : '#000' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem' }}>
                              ${Math.abs(t.amount).toLocaleString('es-CL')}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailsModal(null);
                                  navigate('/transactions?search=' + encodeURIComponent(t.description || t.original_description || ''));
                                }}
                                className="btn-icon"
                                title="Corregir categoría"
                              >
                                <Edit2 size={14} strokeWidth={3} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #000' }}>
                      <td colSpan={isConsolidated ? 3 : 2} style={{ padding: '1rem 0.75rem', fontWeight: 900, fontSize: '1rem', color: '#000' }}>Total</td>
                      <td style={{ padding: '1rem 0.75rem', textAlign: 'right', fontWeight: 900, fontSize: '1rem', color: '#000' }}>
                        ${(detailsModal.transactions.reduce((acc, t) => acc + Math.abs(t.amount), 0)).toLocaleString('es-CL')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
