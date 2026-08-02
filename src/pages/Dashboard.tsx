import { lazy, Suspense, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/authContextValue';
import { AVAILABLE_BANKS, useBanks, type Bank } from '../contexts/bankContextValue';

import { 
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, 
  Wallet, CreditCard, AlertTriangle, Sparkles, Search, X, Edit2,
  ArrowUpRight, ArrowDownRight, Scale, PiggyBank, Calendar, Landmark, FileSpreadsheet, Tags, CheckCircle2, Settings, ChevronDown, RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  AreaChart, Area,
  Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ComposedChart
} from 'recharts';
import NeoDatePicker from '../components/NeoDatePicker';
import InfoTooltip from '../components/InfoTooltip';
import LaikaPet from '../components/LaikaPet';
import { useTaxonomy } from '../hooks/useTaxonomy';
import { toast } from 'react-hot-toast';
import { Dialog } from '../components/Dialog';
import { getShiftedCalendarMonth, getSuggestedDashboardPeriod } from '../utils/dashboardPeriod';
import { calculatePeriodCashPosition, getOpeningBalanceSnapshot } from '../utils/balanceSnapshot';
import {
  analyzeFinancialPeriod,
  classifyFinancialTreatment,
  isCreditCardSettlement,
  isInvestmentMovement,
  isOwnTransferMovement
} from '../utils/transactionSemantics';

const MindMapChart = lazy(() => import('../components/MindMapChart'));
const CascadingCategorySelector = lazy(() => import('./Transactions').then(module => ({
  default: module.CascadingCategorySelector
})));

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
  if (amount > 0) return 'ingreso';
  return null;
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

const normalizeMovementLabel = (value: any) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const isInitialBalanceTransaction = (tx: any) => {
  const text = `${tx.description || ''} ${tx.original_description || ''} ${tx.categoria_secundaria || ''}`;
  return normalizeMovementLabel(text).includes('saldo inicial');
};

const classifyTransactionForReport = (tx: any) => {
  const treatment = classifyFinancialTreatment(tx);
  const kind = treatment.kind || getTransactionKind(tx);
  const amount = treatment.amount || getTransactionAmount(tx);
  const isInvestment = isInvestmentMovement(tx);
  const isInternal = isOwnTransferMovement(tx);
  const isDebtSettlement = isCreditCardSettlement(tx);
  const isInitialBalance = isInitialBalanceTransaction(tx);

  return {
    kind,
    amount,
    isInternal,
    isInvestment,
    isInitialBalance,
    isDebtSettlement,
    treatment,
    isRealIncome: treatment.economicIncome > 0,
    isRealExpense: treatment.economicExpense > 0,
    isInternalIncome: kind === 'ingreso' && isInternal && !isInitialBalance,
    isInternalExpense: kind === 'egreso' && isInternal && !isInitialBalance,
    isInvestmentIncome: kind === 'ingreso' && isInvestment && !isInitialBalance,
    isInvestmentExpense: kind === 'egreso' && isInvestment && !isInitialBalance,
    isDebtSettlementExpense: treatment.eventType === 'credit_card_settlement',
    isLoanPrincipalExpense: treatment.eventType === 'loan_principal',
    isLoanFinanceCost: treatment.eventType === 'loan_finance_cost',
    isUnallocatedLoanExpense: treatment.eventType === 'loan_installment_unallocated'
  };
};

const isFullCalendarMonth = (range: DateRange) => {
  const lastDay = new Date(range.start.getFullYear(), range.start.getMonth() + 1, 0).getDate();
  return range.start.getDate() === 1
    && range.end.getFullYear() === range.start.getFullYear()
    && range.end.getMonth() === range.start.getMonth()
    && range.end.getDate() === lastDay;
};

const isFullCalendarYear = (range: DateRange) => range.start.getMonth() === 0
  && range.start.getDate() === 1
  && range.end.getFullYear() === range.start.getFullYear()
  && range.end.getMonth() === 11
  && range.end.getDate() === 31;

const shiftComparableRange = (range: DateRange, offset: number) => {
  if (isFullCalendarMonth(range)) {
    const start = new Date(range.start.getFullYear(), range.start.getMonth() + offset, 1);
    return {
      start,
      end: new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59)
    };
  }

  if (isFullCalendarYear(range)) {
    const year = range.start.getFullYear() + offset;
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59) };
  }

  const durationMs = range.end.getTime() - range.start.getTime() + 1;
  const start = new Date(range.start.getTime() + offset * durationMs);
  return { start, end: new Date(start.getTime() + durationMs - 1) };
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bankLoadErrors, setBankLoadErrors] = useState<string[]>([]);
  const { user } = useAuth();
  const { activeBank, connectedBanks, dashboardScope, setActiveBank, setDashboardScope } = useBanks();

  const { taxonomy } = useTaxonomy();
  const isConsolidated = dashboardScope === 'all' && connectedBanks.length > 1;
  const dashboardBanks = isConsolidated ? connectedBanks : (activeBank ? [activeBank] : []);
  const dashboardBankKey = dashboardBanks.join('|');
  const activeBankInfo = AVAILABLE_BANKS.find(b => b.id === activeBank);
  const dashboardBankLabel = isConsolidated ? 'Todos los bancos' : (activeBankInfo?.label || 'Sin banco');
  const [advancedOpen, setAdvancedOpen] = useState(() => localStorage.getItem('finanzas_advanced_open') === 'true');
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
      } catch {}
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
  const [editingTxId, setEditingTxId] = useState<string | null>(null);

  const applySingleTx = async (txId: string, proposal: any) => {
    if (!user || !detailsModal) return;
    try {
      const { error } = await supabase
        .from('transactions')
        .update(proposal)
        .eq('user_id', user.id)
        .eq('id', txId);

      if (error) throw error;
      toast.success('Clasificado individualmente');
      
      const updatedTx = { ...detailsModal.transactions.find(t => t.id === txId), ...proposal };
      setDetailsModal(prev => prev ? {
        ...prev,
        transactions: prev.transactions.map(t => t.id === txId ? updatedTx : t)
      } : null);

      fetchTransactions(); // refresca dashboard silenciosamente
      setEditingTxId(null);
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    }
  };

  const toggleCategory = (name: string) => {
    setSelectedCategories(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  useEffect(() => {
    setPeriodWasChosen(sessionStorage.getItem('finanzas_dash_period_chosen') === 'true');
  }, [dashboardScope, activeBank]);

  useEffect(() => {
    if (loading || transactions.length === 0) return;
    if (periodWasChosen) return;

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

    const suggestedPreset = getSuggestedDashboardPeriod({
      periodWasChosen,
      activePreset,
      currentCount,
      previousCount,
      minimumCurrentCount: MIN_CURRENT_MONTH_TRANSACTIONS
    });
    if (suggestedPreset) setDashboardRange(suggestedPreset);
  }, [loading, transactions, periodWasChosen, activePreset]);

  const fetchAllForBank = useCallback(async (bankId: string) => {
    if (!user) return [];
    let allData: any[] = [];
    let from = 0;
    const step = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('bank', bankId)
        .order('date', { ascending: false })
        .range(from, from + step - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      allData = [...allData, ...data];
      if (data.length < step) break;
      from += step;
    }
    return allData;
  }, [user]);

  const fetchTransactions = useCallback(async () => {
    const banksToLoad = dashboardBankKey.split('|').filter(Boolean) as Bank[];
    if (!user || banksToLoad.length === 0) return;
    try {
      setLoading(true);
      setLoadError(null);
      setBankLoadErrors([]);
      if (isConsolidated) {
        const results = await Promise.all(
          banksToLoad.map(async bank => {
            try {
              const data = await fetchAllForBank(bank);
              return { data, bank, error: null };
            } catch (error) {
              return { data: null, bank, error };
            }
          })
        );

        const rows = results.flatMap(result =>
          (result.data || []).map(tx => ({
            ...tx,
            bank: tx.bank || result.bank
          }))
        );
        const failedBanks = results
          .filter(result => result.error)
          .map(result => AVAILABLE_BANKS.find(bank => bank.id === result.bank)?.label || result.bank);

        if (rows.length === 0 && failedBanks.length > 0) {
          throw new Error('No fue posible cargar los movimientos de los bancos seleccionados.');
        }

        rows.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
        setTransactions(rows);
        setBankLoadErrors(failedBanks);
      } else {
        const data = await fetchAllForBank(banksToLoad[0]);
        // Sort ascending for Dashboard
        data.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
        setTransactions(data);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setTransactions([]);
      setLoadError(error instanceof Error ? error.message : 'No fue posible cargar el dashboard.');
    } finally {
      setLoading(false);
    }
  }, [dashboardBankKey, fetchAllForBank, isConsolidated, user]);

  useEffect(() => {
    if (user && dashboardBankKey) {
      fetchTransactions();
    } else {
      setTransactions([]);
      setLoadError(null);
      setBankLoadErrors([]);
      setLoading(false);
    }
  }, [dashboardBankKey, fetchTransactions, user]);

  const openDetailsModal = (conceptName: string, type: 'ingreso' | 'egreso') => {
    const { start, end } = dateRange;
    const txs = transactions.filter(t => {
      const d = parseLocalDate(t.date);
      const report = classifyTransactionForReport(t);
      return d >= start && d <= end
        && !report.isInitialBalance
        && report.kind === type;
    });

    let filtered: any[] = [];
    if (type === 'ingreso') {
      filtered = txs.filter(t => {
        const report = classifyTransactionForReport(t);
        const catP = t.categoria_principal?.toLowerCase() || '';
        
        if (conceptName === 'Transferencias propias recibidas') return report.isInternalIncome;
        if (!report.isRealIncome) return false;
        
        if (conceptName === 'Sueldo') return catP.includes('sueldo');
        if (conceptName === 'Honorarios') return catP.includes('honorarios') || catP.includes('profesionales');
        if (conceptName === 'Otros Ingresos') return !catP.includes('sueldo') && !catP.includes('honorarios') && !catP.includes('profesionales');
        return false;
      });
    } else {
      filtered = txs.filter(t => {
        const report = classifyTransactionForReport(t);
        const catP = t.categoria_principal || 'Sin Clasificar';
        
        if (conceptName === 'Egreso Propio') return report.isInternalExpense;
        if (!report.isRealExpense) return false;
        
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
    const previous = shiftComparableRange(dateRange, -1);
    return {
      currentRange: { start: dateRange.start, end: dateRange.end },
      prevRange: previous
    };
  }, [dateRange]);

  const filteredTransactions = useMemo(() => {
    const { start, end } = dateRange;
    return transactions.filter(t => {
      const d = parseLocalDate(t.date);
      return d >= start && d <= end;
    });
  }, [transactions, dateRange]);

  const periodMovements = useMemo(() => {
    return filteredTransactions.filter(t => !isInitialBalanceTransaction(t));
  }, [filteredTransactions]);

  const availablePeriods = useMemo(() => {
    const months = new Map<string, { start: Date; end: Date; label: string; count: number }>();
    transactions.forEach(t => {
      if (isInitialBalanceTransaction(t)) return;
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

  const shiftDisplayedMonth = (offset: number) => {
    applyRangeObject(getShiftedCalendarMonth(dateRange.start, offset));
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
      let rescateInversion = 0;
      let aporteInversion = 0;
      let pagoDeudaAnterior = 0;
      
      const catsPrincipal: Record<string, number> = {};
      const catsSecundaria: Record<string, number> = {};
      let unclassifiedCount = 0;

      const availableCats = new Set<string>();

      let maxIncomeDesc = '';
      let maxIncomeAmount = 0;
      const recurringExpenses: Record<string, { total: number; count: number }> = {};

      const txs = transactions.filter(t => {
        const d = parseLocalDate(t.date);
        return d >= start && d <= end && !isInitialBalanceTransaction(t);
      });
      const periodAnalysis = analyzeFinancialPeriod(txs, transactions);
      const periodBankIds = dashboardBankKey.split('|').filter(Boolean);
      const openingBalance = getOpeningBalanceSnapshot(transactions, start, periodBankIds);
      const cashPosition = calculatePeriodCashPosition(openingBalance, periodAnalysis.totals.cashInflow, periodAnalysis.totals.cashOutflow);

      txs.forEach(t => {
        const isUnclassified = !t.categoria_principal || t.categoria_principal === 'Sin Clasificar';
        const report = classifyTransactionForReport(t);

        if (report.isInvestmentIncome) {
          rescateInversion += report.amount;
        } else if (report.isInvestmentExpense) {
          aporteInversion += report.amount;
        } else if (report.isDebtSettlementExpense) {
          pagoDeudaAnterior += report.amount;
        } else if (report.isInternalIncome) {
          aportePropio += report.amount;
          ingresos += report.amount;
        } else if (report.isRealIncome) {
            ingresos += report.amount;
            
            const catP = t.categoria_principal?.toLowerCase() || '';
            if (catP.includes('sueldo')) {
              sueldo += report.amount;
            } else if (catP.includes('honorarios') || catP.includes('profesionales')) {
              honorarios += report.amount;
            } else {
              ingresosOtros += report.amount;
            }

            // For intelligence
            if (report.amount > maxIncomeAmount) {
              maxIncomeAmount = report.amount;
              maxIncomeDesc = t.description || t.categoria_principal || 'Ingreso';
            }
        } else if (report.isInternalExpense) {
            movimientoInternoEgreso += report.amount;
        } else if (report.isRealExpense) {
            const absAmt = report.amount;
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
        const report = classifyTransactionForReport(t);
        if (report.isRealExpense) {
          const desc = (t.description || t.original_description || 'Sin descripción').trim();
          catsDetalle[desc] = (catsDetalle[desc] || 0) + report.amount;
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
        rescateInversion,
        aporteInversion,
        pagoDeudaAnterior,
        cashInflow: periodAnalysis.totals.cashInflow,
        cashOutflow: periodAnalysis.totals.cashOutflow,
        netCashFlow: periodAnalysis.totals.netCashFlow,
        economicIncome: periodAnalysis.totals.economicIncome,
        economicExpense: periodAnalysis.totals.economicExpense,
        economicResult: periodAnalysis.totals.economicResult,
        loanPrincipalAmount: periodAnalysis.totals.loanPrincipalOutflow,
        loanFinanceCost: periodAnalysis.totals.loanFinanceCost,
        unallocatedLoanAmount: periodAnalysis.totals.unallocatedLoanOutflow,
        cardCoverage: periodAnalysis.cardCoverage,
        semanticWarnings: periodAnalysis.warnings,
        openingBalance,
        cashPosition,
        estimatedClosingBalance: cashPosition.closingBalance,
        topCatsPrincipal,
        topCatsSecundaria,
        topCatsDetalle,
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
      current: calcForRange(currentRange.start, currentRange.end), 
      prev: calcForRange(prevRange.start, prevRange.end) 
    };
  }, [transactions, currentRange, prevRange, dashboardBankKey]);

  const bankBreakdown = useMemo(() => {
    const byBank = new Map<string, { bank: string; label: string; color: string; ingresos: number; egresos: number; internal: number; count: number }>();

    dashboardBankKey.split('|').filter(Boolean).forEach(bankName => {
      const bankInfo = AVAILABLE_BANKS.find(bank => bank.id === bankName);
      byBank.set(bankName, {
        bank: bankName,
        label: bankInfo?.label || bankName,
        color: bankInfo?.color || '#94a3b8',
        ingresos: 0,
        egresos: 0,
        internal: 0,
        count: 0
      });
    });

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
          internal: 0,
          count: 0
        });
      }

      const item = byBank.get(bankName)!;
      const report = classifyTransactionForReport(t);
      if (report.isRealIncome || report.isInternalIncome) item.ingresos += report.amount;
      if (report.isRealExpense) item.egresos += report.amount;
      if (report.isInternalIncome || report.isInternalExpense || report.isInvestmentIncome || report.isInvestmentExpense) item.internal += report.amount;
      item.count += 1;
    });

    return Array.from(byBank.values()).sort((a, b) => (b.ingresos + b.egresos) - (a.ingresos + a.egresos));
  }, [periodMovements, dashboardBankKey]);

  const showSingleBank = (bank: string) => {
    const nextBank = bank as Bank;
    setActiveBank(nextBank);
    setDashboardScope(nextBank);
  };

  // Generate 6 buckets history for sparklines (based on dateRange duration)
  const historyData = useMemo(() => {
    const data = [];
    for (let i = -5; i <= 0; i++) {
      const bucket = shiftComparableRange(dateRange, i);
      let ing = 0, gas = 0;
      transactions.forEach(t => {
        const d = parseLocalDate(t.date);
        if (d >= bucket.start && d <= bucket.end) {
          const report = classifyTransactionForReport(t);
          if (report.isRealIncome || report.isInternalIncome) ing += report.amount;
          if (report.isRealExpense) gas += report.amount;
        }
      });
      const label = isFullCalendarMonth(dateRange)
        ? bucket.start.toLocaleString('es-CL', { month: 'short', year: '2-digit' })
        : isFullCalendarYear(dateRange)
          ? bucket.start.getFullYear().toString()
          : bucket.start.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
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
          const key = getKey(d);
          if (data[key]) {
            const report = classifyTransactionForReport(t);
            if (report.isRealIncome || report.isInternalIncome) data[key].Ingresos += report.amount;
            if (report.isRealExpense) data[key].Egresos += report.amount;
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
          const report = classifyTransactionForReport(t);
          if (report.isRealExpense) {
            const catField = categoryLevel === 'detalle'
              ? (t.description || t.original_description || '').trim()
              : categoryLevel === 'principal'
                ? (t.categoria_principal || 'Sin Clasificar')
                : (t.categoria_secundaria || 'Sin Clasificar');
            if (selectedCategories.includes(catField)) {
              const key = getKey(d);
              if (data[key]) data[key][catField] += report.amount;
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
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(dashboardBanks.length > 0 ? '/import' : '/settings#bancos')}
                style={{ padding: '0.9rem 1.25rem', fontSize: '0.95rem' }}
              >
                {dashboardBanks.length > 0 ? <FileSpreadsheet size={20} /> : <Landmark size={20} />}
                {dashboardBanks.length > 0 ? 'Importar primera cartola' : 'Configurar banco'}
              </button>
              <button
                type="button"
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
              type="button"
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
      <div className="dashboard-empty-period">
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
              type="button"
              className="btn btn-primary"
              onClick={() => applyRangeObject({ start: nextPeriod.start, end: nextPeriod.end, label: nextPeriod.label })}
              style={{ justifyContent: 'center' }}
            >
              Ver {nextPeriod.label}
            </button>
          )}
          <button
            type="button"
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

  const renderLoadErrorState = () => (
    <section className="dashboard-error-state" role="alert" aria-live="assertive">
      <div className="dashboard-state-icon" aria-hidden="true">
        <AlertTriangle size={26} strokeWidth={2.5} />
      </div>
      <div className="dashboard-state-copy">
        <h2>No pudimos cargar el resumen</h2>
        <p>{loadError || 'Ocurrió un problema al consultar tus movimientos.'}</p>
      </div>
      <button type="button" className="btn btn-primary" onClick={fetchTransactions}>
        <RefreshCw size={18} />
        Reintentar
      </button>
    </section>
  );

  const renderPartialLoadWarning = () => {
    if (bankLoadErrors.length === 0) return null;

    return (
      <div className="dashboard-partial-warning" role="status" aria-live="polite">
        <AlertTriangle size={20} strokeWidth={2.5} aria-hidden="true" />
        <div>
          <strong>El consolidado está incompleto.</strong>
          <span>No pudimos cargar {bankLoadErrors.join(', ')}. Los totales visibles consideran solo los bancos disponibles.</span>
        </div>
        <button type="button" className="btn btn-outline" onClick={fetchTransactions}>
          <RefreshCw size={17} />
          Reintentar
        </button>
      </div>
    );
  };

  // BLOCK 1: DATE RANGE PICKER
  const renderHeader = () => {
    const fmt = (d: Date) => d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
    const displayLabel = dateRange.label.length > 30
      ? `${fmt(dateRange.start)} — ${fmt(dateRange.end)}`
      : dateRange.label;
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const selectedMonthStart = new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), 1);
    const canAdvanceMonth = selectedMonthStart < currentMonthStart;

    return (
      <header className="dashboard-header">
        <div className="dashboard-header-main">
          <div className="dashboard-title-context">
            <h1>Resumen financiero</h1>
            <div className="dashboard-context-line" aria-label={`Vista de ${dashboardBankLabel}`}>
              <span
                className="dashboard-context-dot"
                style={{ backgroundColor: isConsolidated ? '#111827' : (activeBankInfo?.color || '#94a3b8') }}
                aria-hidden="true"
              />
              <strong>{dashboardBankLabel}</strong>
              {periodMovements.length > 0 && (
                <span>{periodMovements.length.toLocaleString('es-CL')} movimientos en el periodo</span>
              )}
            </div>
          </div>

          {/* Date Range Picker Trigger */}
          <div ref={pickerRef} className="dashboard-date-control">
            <div className="dashboard-month-navigation">
              <button type="button" className="dashboard-month-arrow" onClick={() => shiftDisplayedMonth(-1)} aria-label="Mes anterior" title="Mes anterior">
                <ChevronLeft size={19} strokeWidth={3} />
              </button>
              <button
                type="button"
                className="dashboard-period-trigger"
                onClick={() => setPickerOpen(o => !o)}
                aria-expanded={pickerOpen}
                aria-haspopup="dialog"
                aria-controls="dashboard-date-popover"
              >
                <Calendar size={20} strokeWidth={2.5} />
                <span>{displayLabel}</span>
              </button>
              <button type="button" className="dashboard-month-arrow" onClick={() => shiftDisplayedMonth(1)} disabled={!canAdvanceMonth} aria-label="Mes siguiente" title="Mes siguiente">
                <ChevronRight size={19} strokeWidth={3} />
              </button>
            </div>

            {/* Dropdown */}
            {pickerOpen && (
              <div id="dashboard-date-popover" role="dialog" aria-label="Seleccionar periodo" className="date-popover" style={{ position: 'absolute', top: 'calc(100% + 8px)', backgroundColor: '#fff', border: '2px solid #000', borderRadius: '16px', boxShadow: '4px 4px 0px #000', zIndex: 200, minWidth: '300px' }}>
                {/* Preset pills */}
                <div style={{ padding: '1rem', borderBottom: '2px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.6rem', letterSpacing: '0.05em' }}>Accesos rápidos</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {PRESETS.map(p => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => applyPreset(p.id)}
                        aria-pressed={activePreset === p.id}
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
                    <div className="dashboard-custom-date-fields">
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
                      type="button"
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
      </header>
    );
  };

  // BLOCK 2: MAIN NUMBERS
  const renderMainNumbers = () => {
    const c = stats.current;
    const p = stats.prev;
    const hasLoanReview = c.unallocatedLoanAmount > 0;
    const hasCardReview = c.cardCoverage.status === 'absent' || c.cardCoverage.status === 'partial';
    const otherSemanticWarnings = c.semanticWarnings.filter((warning: string) => (
      !warning.startsWith('Esta cuota mezcla capital') && warning !== c.cardCoverage.message
    ));
    const reviewCount = Number(hasLoanReview) + Number(hasCardReview) + otherSemanticWarnings.length;

    // Income Logic
    const totalEntradas = c.economicIncome;
    const incomeData: { name: string; value: number; isGray?: boolean }[] = [
      { name: 'Sueldo', value: c.sueldo },
      { name: 'Honorarios', value: c.honorarios },
      { name: 'Otros Ingresos', value: c.ingresosOtros }
    ];

    // Expense Logic
    const sorted = [...c.topCatsPrincipal].filter(x => x.name !== 'Sin Clasificar');
    const top3 = sorted.slice(0, 3);
    const others = sorted.slice(3).reduce((acc, curr) => acc + curr.amount, 0);
    const sinClasificarAmount = c.topCatsPrincipal.find(x => x.name === 'Sin Clasificar')?.amount || 0;
    const totalOtros = others + sinClasificarAmount;
    const totalSalidas = c.economicExpense;
    
    const expenseData: { name: string; value: number; isGray?: boolean }[] = [
      ...top3.map(cat => ({ name: cat.name, value: cat.amount })),
      ...(totalOtros > 0 ? [{ name: 'Otros Egresos', value: totalOtros }] : [])
    ];

    return (
      <>
        <section className="dashboard-cash-equation" aria-label="Cálculo del saldo de cierre">
          <div><span>Saldo al comenzar</span><strong>{c.openingBalance.detectedBankCount > 0 ? `$${c.openingBalance.total.toLocaleString('es-CL')}` : 'No disponible'}</strong></div>
          <b aria-hidden="true">+</b>
          <div><span>Entró</span><strong>${c.cashInflow.toLocaleString('es-CL')}</strong></div>
          <b aria-hidden="true">−</b>
          <div><span>Salió</span><strong>${c.cashOutflow.toLocaleString('es-CL')}</strong></div>
          <b aria-hidden="true">=</b>
          <div className={(c.estimatedClosingBalance ?? 0) < 0 ? 'is-negative' : 'is-positive'}>
            <span>Saldo estimado al cierre</span>
            <strong>{c.estimatedClosingBalance !== null ? `${c.estimatedClosingBalance < 0 ? '−' : ''}$${Math.abs(c.estimatedClosingBalance).toLocaleString('es-CL')}` : 'Pendiente'}</strong>
          </div>
          {!c.openingBalance.complete && c.openingBalance.detectedBankCount > 0 && (
            <small>Calculado con {c.openingBalance.detectedBankCount} de {c.openingBalance.bankCount} bancos; faltan saldos de {c.openingBalance.missingBanks.join(', ')}.</small>
          )}
        </section>
        {reviewCount > 0 && (
          <details className="dashboard-semantic-warning">
            <summary><AlertTriangle size={18} aria-hidden="true" /> {reviewCount} {reviewCount === 1 ? 'comprobación opcional' : 'comprobaciones opcionales'}</summary>
            <div className="financial-review-list">
              {hasLoanReview && (
                <article className="financial-review-item">
                  <strong>Cuota de crédito sin desglose</strong>
                  <p>Se están contando ${c.unallocatedLoanAmount.toLocaleString('es-CL')} completos como gasto. Si conoces cuánto corresponde a capital, interés y comisión, puedes dividirla. Si no tienes ese detalle, puedes dejarla así.</p>
                  <button type="button" onClick={() => navigate('/transactions?search=Servicio%20de%20Deuda')}>Ver la cuota</button>
                </article>
              )}
              {hasCardReview && (
                <article className="financial-review-item">
                  <strong>Faltan compras de la tarjeta</strong>
                  <p>Registramos un pago de ${c.cardCoverage.settlementAmount.toLocaleString('es-CL')}, pero solo ${c.cardCoverage.importedPurchaseAmount.toLocaleString('es-CL')} en compras. Importa las compras del ciclo para que el consumo no quede subestimado.</p>
                  <button type="button" onClick={() => navigate('/import?source=capture')}>Importar compras de tarjeta</button>
                </article>
              )}
              {otherSemanticWarnings.map((warning: string) => (
                <article className="financial-review-item" key={warning}><strong>Movimiento por revisar</strong><p>{warning}</p></article>
              ))}
            </div>
          </details>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '2rem', marginBottom: '3rem' }}>
        {/* Ingresos Card */}
        <div style={{ ...neoCard, position: 'relative', overflow: 'hidden', paddingBottom: '7rem', marginBottom: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ backgroundColor: '#bbf7d0', borderRadius: '50%', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '44px', height: '44px' }}>
                <Wallet size={24} strokeWidth={2.5} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, fontFamily: '"Montserrat", sans-serif', display: 'flex', alignItems: 'center' }}>
                Ingresos reales
                <InfoTooltip content="Ingresos económicos del período. Transferencias propias y rescates de capital se muestran en el flujo de caja, pero no crean ingreso nuevo." />
              </h3>
            </div>
            {renderTrendBadge(totalEntradas, p.economicIncome, false)}
          </div>
          <p className="dashboard-kpi-amount" style={{ margin: c.rescateInversion > 0 ? '0 0 0.25rem 0' : '0 0 2rem 0', fontSize: '3.5rem', fontWeight: 900, position: 'relative', zIndex: 10, letterSpacing: '0' }}>
            ${totalEntradas.toLocaleString('es-CL')}
          </p>
          {c.rescateInversion > 0 && (
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, marginBottom: '1.5rem', position: 'relative', zIndex: 10 }}>
              *Además rescataste ${c.rescateInversion.toLocaleString('es-CL')} desde inversiones; no se contabiliza como ingreso
            </div>
          )}
          {c.aportePropio > 0 && (
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
              *Además recibiste ${c.aportePropio.toLocaleString('es-CL')} desde cuentas propias; afecta caja, no ingresos
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
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label={`Ver detalle de ${row.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openDetailsModal(row.name, 'ingreso');
                            }}
                          >
                            <Search size={14} strokeWidth={3} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#bbf7d0', borderTop: '2px solid #000' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 900, borderRight: '2px solid #000' }}>Total ingresos</td>
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
                Gastos y consumo
                <InfoTooltip content="Consumo y costos originados en el período. Capital de deudas desglosado, pagos de tarjeta, inversiones y transferencias quedan visibles en el flujo de caja." />
              </h3>
            </div>
            {renderTrendBadge(totalSalidas, p.economicExpense, true)}
          </div>
          <p className="dashboard-kpi-amount" style={{ margin: c.movimientoInternoEgreso > 0 || c.aporteInversion > 0 || c.pagoDeudaAnterior > 0 ? '0 0 0.25rem 0' : '0 0 2rem 0', fontSize: '3.5rem', fontWeight: 900, position: 'relative', zIndex: 10, letterSpacing: '0' }}>
            ${totalSalidas.toLocaleString('es-CL')}
          </p>
          {c.movimientoInternoEgreso > 0 && (
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, marginBottom: '1.5rem', position: 'relative', zIndex: 10 }}>
              *Adicionalmente enviaste ${c.movimientoInternoEgreso.toLocaleString('es-CL')} a movimientos internos o inversiones
            </div>
          )}
          {c.aporteInversion > 0 && (
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, marginBottom: '1.5rem', position: 'relative', zIndex: 10 }}>
              *Además invertiste ${c.aporteInversion.toLocaleString('es-CL')}; no se contabiliza como gasto
            </div>
          )}
          {c.pagoDeudaAnterior > 0 && (
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, marginBottom: '1.5rem', position: 'relative', zIndex: 10 }}>
              *Pago de tarjeta registrado en este periodo: ${c.pagoDeudaAnterior.toLocaleString('es-CL')}. Salió de caja y no se repite como consumo
            </div>
          )}
          {c.loanPrincipalAmount > 0 && (
            <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
              *${c.loanPrincipalAmount.toLocaleString('es-CL')} redujeron capital de créditos; salieron de caja, pero no son consumo nuevo
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
                          <button
                            type="button"
                            className="btn-icon"
                            aria-label={`Ver detalle de ${row.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openDetailsModal(row.name, 'egreso');
                            }}
                          >
                            <Search size={14} strokeWidth={3} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#fecaca', borderTop: '2px solid #000' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 900, borderRight: '2px solid #000' }}>Total gastos</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 900 }}>${totalSalidas.toLocaleString('es-CL')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {renderSparkline('Egresos', '#fee2e2')}
        </div>
        </div>
      </>
    );
  };

  const renderBankBreakdown = () => {
    if (!isConsolidated || bankBreakdown.length === 0) return null;

    const breakdownIncome = bankBreakdown.reduce((sum, bank) => sum + bank.ingresos, 0);
    const breakdownExpenses = bankBreakdown.reduce((sum, bank) => sum + bank.egresos, 0);
    const totalsMatch = Math.abs(breakdownIncome - stats.current.ingresos) < 0.5
      && Math.abs(breakdownExpenses - stats.current.gastosTotales) < 0.5;

    return (
      <section className="dashboard-bank-section" aria-labelledby="dashboard-bank-breakdown-title">
        <div className="dashboard-bank-header">
          <div>
            <h2 id="dashboard-bank-breakdown-title">
              <Landmark size={22} strokeWidth={2.5} aria-hidden="true" />
              Consolidado por banco
            </h2>
            <p>Compara qué aporta cada banco usando las mismas reglas del resumen principal.</p>
          </div>
          <div className={`dashboard-reconciliation ${totalsMatch ? 'is-ok' : 'is-warning'}`}>
            {totalsMatch ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            {totalsMatch ? 'Totales conciliados' : 'Revisar conciliación'}
          </div>
        </div>

        <div className="dashboard-bank-summary" aria-label="Totales consolidados">
          <span><strong>${breakdownIncome.toLocaleString('es-CL')}</strong> entradas contabilizadas</span>
          <span><strong>${breakdownExpenses.toLocaleString('es-CL')}</strong> egresos reales</span>
          <span><strong>{periodMovements.length.toLocaleString('es-CL')}</strong> movimientos</span>
        </div>

        <div className="dashboard-bank-grid">
          {bankBreakdown.map(bank => {
            const balance = bank.ingresos - bank.egresos;
            return (
              <article className="dashboard-bank-card" key={bank.bank}>
                <div className="dashboard-bank-card-title">
                  <span className="dashboard-bank-dot" style={{ backgroundColor: bank.color }} aria-hidden="true" />
                  <div>
                    <h3>{bank.label}</h3>
                    <span>{bank.count.toLocaleString('es-CL')} movimientos</span>
                  </div>
                </div>
                <dl className="dashboard-bank-metrics">
                  <div>
                    <dt>Ingresos</dt>
                    <dd className="is-income">${bank.ingresos.toLocaleString('es-CL')}</dd>
                  </div>
                  <div>
                    <dt>Egresos</dt>
                    <dd className="is-expense">${bank.egresos.toLocaleString('es-CL')}</dd>
                  </div>
                  <div>
                    <dt>Balance</dt>
                    <dd className={balance >= 0 ? 'is-income' : 'is-expense'}>
                      {balance >= 0 ? '+' : '-'}${Math.abs(balance).toLocaleString('es-CL')}
                    </dd>
                  </div>
                </dl>
                <div className="dashboard-bank-card-footer">
                  <span>${bank.internal.toLocaleString('es-CL')} movimientos internos identificados</span>
                  <button type="button" className="btn btn-outline" onClick={() => showSingleBank(bank.bank)}>
                    Ver banco
                    <ChevronRight size={16} strokeWidth={3} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
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
              <button type="button" onClick={() => setSelectedCategories([])} style={{ marginTop: '0.5rem', fontSize: '0.75rem', fontWeight: 800, background: '#fef08a', border: '2px solid #000', borderRadius: '2rem', padding: '0.35rem 0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <X size={14} strokeWidth={3} />
                Limpiar selección ({selectedCategories.length})
              </button>
            )}
          </div>
          
          <div className="dashboard-category-levels" role="group" aria-label="Nivel de categoría">
            {(['principal', 'secundaria', 'detalle'] as CategoryLevel[]).map(level => (
              <button
                type="button"
                key={level}
                aria-pressed={categoryLevel === level}
                onClick={() => { setCategoryLevel(level); setSelectedCategories([]); }}
                className={`dashboard-category-level ${categoryLevel === level ? `is-active is-${level}` : ''}`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
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
                    <button
                      type="button"
                      key={entry.name}
                      onClick={() => toggleCategory(entry.name)}
                      aria-pressed={isSelected}
                      className="dashboard-ranking-row"
                      style={{ opacity: selectedCategories.length > 0 && !isSelected ? 0.4 : 1 }}
                    >
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color, border: '2px solid #000', flexShrink: 0 }}></div>
                      <div className="dashboard-ranking-label" title={entry.name}>{entry.name}</div>
                      <div style={{ flex: 1, height: '20px', backgroundColor: '#f1f5f9', border: '2px solid #000', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: isSelected ? color : color + 'bb', borderRadius: '2px', transition: 'width 0.3s' }}></div>
                        {isSelected && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: '2px solid #000', borderRadius: '4px', boxSizing: 'border-box' }}></div>}
                      </div>
                      <div className="dashboard-ranking-amount">${entry.amount.toLocaleString('es-CL')}</div>
                    </button>
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
        <button type="button" className="btn btn-primary" onClick={() => navigate('/transactions')}>
          Clasificar ahora
        </button>
      </div>
    );
  };

  // BLOCK 7: YEARLY CHART (rich version)
  const renderYearlyChart = () => {
    const year = dateRange.start.getFullYear();
    const monthlyData: { mes: string; mesIdx: number; Ingresos: number; IngresoReal: number; AportePropio: number; Egresos: number; Balance: number; tasaAhorro: number }[] = [];

    const today = new Date();
    const maxMonth = year === today.getFullYear() ? today.getMonth() : 11;

    for (let m = 0; m <= maxMonth; m++) {
      const start = new Date(year, m, 1);
      const end = new Date(year, m + 1, 0, 23, 59, 59);
      let ing = 0, aporte = 0, gas = 0;
      transactions.forEach(t => {
        const d = parseLocalDate(t.date);
        if (d >= start && d <= end) {
          const report = classifyTransactionForReport(t);
          if (report.isRealIncome) ing += report.amount;
          if (report.isInternalIncome) aporte += report.amount;
          if (report.isRealExpense) gas += report.amount;
        }
      });
      monthlyData.push({
        mes: new Date(year, m, 1).toLocaleString('es-CL', { month: 'short' }),
        mesIdx: m,
        Ingresos: ing + aporte,
        IngresoReal: ing,
        AportePropio: aporte,
        Egresos: gas,
        Balance: ing + aporte - gas,
        tasaAhorro: ing > 0 ? Math.round(((ing - gas) / ing) * 100) : 0
      });
    }

    const hasData = monthlyData.some(d => d.Ingresos > 0 || d.Egresos > 0);
    if (!hasData) return null;

    const totalIng = monthlyData.reduce((a, d) => a + d.Ingresos, 0);
    const totalRealIng = monthlyData.reduce((a, d) => a + d.IngresoReal, 0);
    const totalGas = monthlyData.reduce((a, d) => a + d.Egresos, 0);
    const totalBal = totalIng - totalGas;
    const tasaAnual = totalRealIng > 0 ? Math.round(((totalRealIng - totalGas) / totalRealIng) * 100) : 0;

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
            <span>Entradas disponibles</span><span>${d.Ingresos.toLocaleString('es-CL')}</span>
          </div>
          {d.AportePropio > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#15803d', fontSize: '0.8rem', fontWeight: 700 }}>
              <span>└ Fondos propios</span><span>${d.AportePropio.toLocaleString('es-CL')}</span>
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
              <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: '#16a34a', letterSpacing: '0.05em' }}>Entradas disponibles</span>
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
                <InfoTooltip content="Ingresos reales y fondos propios recibidos, menos gastos reales. Las transferencias salientes entre tus cuentas no se tratan como gasto." />
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
                {tasaAnual >= 20 ? 'Excelente' : tasaAnual >= 10 ? 'Bien' : tasaAnual >= 0 ? 'Ajustado' : 'Déficit'}
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

  const renderAdvancedAnalysis = () => (
    <section className="dashboard-advanced" aria-labelledby="dashboard-advanced-title">
      <button
        type="button"
        className="dashboard-advanced-toggle"
        aria-expanded={advancedOpen}
        aria-controls="dashboard-advanced-content"
        onClick={() => {
          const next = !advancedOpen;
          setAdvancedOpen(next);
          localStorage.setItem('finanzas_advanced_open', String(next));
        }}
      >
        <div>
          <span id="dashboard-advanced-title">Análisis avanzado</span>
          <small>Resumen anual y mapa detallado del flujo de dinero</small>
        </div>
        <span className="dashboard-advanced-action">
          {advancedOpen ? 'Ocultar' : 'Explorar'}
          <ChevronDown size={20} strokeWidth={2.5} style={{ transform: advancedOpen ? 'rotate(180deg)' : 'none' }} />
        </span>
      </button>

      {advancedOpen && (
        <div id="dashboard-advanced-content" className="dashboard-advanced-content">
          {renderYearlyChart()}
          <div className="card dashboard-mind-map">
            <h2>Mapa de flujo de dinero</h2>
            <p>
              Explora cómo se distribuyen los movimientos del periodo. El saldo inicial se excluye del análisis.
            </p>
            <Suspense fallback={<div className="skeleton dashboard-advanced-skeleton" role="status"><span className="sr-only">Cargando mapa de flujo</span></div>}>
              <MindMapChart transactions={periodMovements} taxonomy={taxonomy} />
            </Suspense>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '4rem', padding: '0 1rem', paddingTop: '2rem' }}>
      {renderHeader()}
      
      {dashboardBanks.length === 0 ? (
        renderOnboardingWizard()
      ) : loading ? (
        <div style={{ marginTop: '2rem' }} role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">Cargando resumen financiero</span>
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
      ) : loadError ? (
        renderLoadErrorState()
      ) : transactions.length === 0 ? (
        renderOnboardingWizard()
      ) : (
        <>
          {renderPartialLoadWarning()}
          {periodMovements.length === 0 ? (
            renderEmptyPeriodState()
          ) : (
            <>
              {renderUnclassifiedAlert()}
              {renderMainNumbers()}
              {renderBankBreakdown()}
              {renderAnalysisBlock()}
              {renderAdvancedAnalysis()}
            </>
          )}
        </>
      )}

      {/* Details Modal */}
      {detailsModal && detailsModal.isOpen && (
        <Dialog
          onClose={() => setDetailsModal(null)}
          labelledBy="dashboard-detail-dialog-title"
          describedBy="dashboard-detail-dialog-period"
          panelStyle={{ width: 'min(94vw, 980px)', maxWidth: '980px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
            <div className="dialog-header">
              <div>
                <h2 id="dashboard-detail-dialog-title" style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, fontFamily: '"Montserrat", sans-serif' }}>{detailsModal.title}</h2>
                <div id="dashboard-detail-dialog-period" style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, marginTop: '0.25rem', textTransform: 'capitalize' }}>
                  {dateRange.start.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })} — {dateRange.end.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <button type="button" className="dialog-close" onClick={() => setDetailsModal(null)} aria-label={`Cerrar detalle de ${detailsModal.title}`}>
                <X size={24} strokeWidth={3} />
              </button>
            </div>
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, backgroundColor: '#fff', borderRadius: '0 0 9px 9px' }}>
              {detailsModal.transactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#64748b' }}>No hay movimientos para este concepto.</p>
                </div>
              ) : (
                <table className="dashboard-detail-table" style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 800, fontSize: '0.9rem', color: '#475569' }}>Fecha</th>
                      {isConsolidated && (
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 800, fontSize: '0.9rem', color: '#475569' }}>Banco</th>
                      )}
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 800, fontSize: '0.9rem', color: '#475569' }}>Descripción</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 800, fontSize: '0.9rem', color: '#475569' }}>Categoría</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, fontSize: '0.9rem', color: '#475569' }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailsModal.transactions.map((t, i) => {
                      const bankId = getCanonicalBankId(t.bank);
                      const bankInfo = AVAILABLE_BANKS.find(bank => bank.id === bankId);
                      const bankLabel = bankInfo?.label || bankId;
                      const bankColor = bankInfo?.color || '#94a3b8';
                      const categoryPath = Array.from(new Set([
                        t.categoria_principal,
                        t.categoria_secundaria
                      ].filter(Boolean))).join(' > ');

                      if (editingTxId === t.id) {
                        return (
                          <tr className="dashboard-detail-edit-row" key={t.id} style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #000' }}>
                            <td colSpan={isConsolidated ? 5 : 4} style={{ padding: '1rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>Clasificar "{t.description || t.original_description}"</span>
                                <button type="button" className="btn btn-outline" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setEditingTxId(null)}>Cancelar</button>
                              </div>
                              <div style={{ border: '2px solid #000', borderRadius: '6px', overflow: 'hidden' }}>
                                <Suspense fallback={<div className="skeleton dashboard-classifier-skeleton" role="status"><span className="sr-only">Cargando clasificador</span></div>}>
                                  <CascadingCategorySelector
                                    initialTipo={t.tipo_movimiento}
                                    initialPrincipal={t.categoria_principal || ''}
                                    initialSecundaria={t.categoria_secundaria || ''}
                                    contextDescription={t.description || t.original_description}
                                    onSave={async (tipo: string, princ: string, sec: string) => {
                                      await applySingleTx(t.id, { tipo_movimiento: tipo, categoria_principal: princ, categoria_secundaria: sec });
                                    }}
                                  />
                                </Suspense>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={t.id} style={{ borderBottom: i === detailsModal.transactions.length - 1 ? 'none' : '1px solid #e2e8f0', backgroundColor: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          <td data-label="Fecha" style={{ padding: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.9rem' }}>{t.date}</td>
                          {isConsolidated && (
                            <td data-label="Banco" style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.55rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fff', boxShadow: '1px 1px 0 #000', fontSize: '0.72rem', fontWeight: 900 }}>
                                <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: bankColor, border: '1.5px solid #000', flexShrink: 0 }} />
                                {bankLabel}
                              </span>
                            </td>
                          )}
                          <td data-label="Descripción" style={{ padding: '0.75rem', fontSize: '0.9rem', fontWeight: 500 }}>{t.description || t.original_description || 'Sin descripción'}</td>
                          <td data-label="Categoría" className="dashboard-detail-category" style={{ padding: '0.75rem' }}>
                            <span className={categoryPath ? '' : 'is-unclassified'}>
                              {categoryPath || 'Sin clasificar'}
                            </span>
                          </td>
                          <td data-label="Monto" style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: getTransactionKind(t) === 'ingreso' ? '#16a34a' : '#000' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem' }}>
                              ${Math.abs(t.amount).toLocaleString('es-CL')}
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTxId(t.id);
                                }}
                                className="btn-icon"
                                title="Clasificar aquí mismo"
                                aria-label={`Clasificar ${t.description || t.original_description || 'movimiento'} aquí mismo`}
                                style={{ padding: '0.2rem' }}
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
                      <td colSpan={isConsolidated ? 4 : 3} style={{ padding: '1rem 0.75rem', fontWeight: 900, fontSize: '1rem', color: '#000' }}>Total</td>
                      <td style={{ padding: '1rem 0.75rem', textAlign: 'right', fontWeight: 900, fontSize: '1rem', color: '#000' }}>
                        ${(detailsModal.transactions.reduce((acc, t) => acc + Math.abs(t.amount), 0)).toLocaleString('es-CL')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
        </Dialog>
      )}
    </div>
  );
}
