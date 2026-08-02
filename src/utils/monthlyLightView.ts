import type { FixedExpense } from '../contexts/settingsContextValue.ts';
import { evaluateAccountMatch } from './fixedExpenseMatching.ts';
import { parseLocalDateInput } from './localDate.ts';
import { getOpeningBalanceSnapshot } from './balanceSnapshot.ts';
import {
  analyzeFinancialPeriod,
  classifyFinancialTreatment,
  isCreditCardSettlement,
  isInvestmentMovement,
  isOwnTransferMovement
} from './transactionSemantics.ts';

export interface LightTransaction {
  id: string;
  date: string;
  description?: string | null;
  original_description?: string | null;
  amount: number;
  type?: string | null;
  bank?: string | null;
  created_at?: string | null;
  tipo_movimiento?: string | null;
  categoria_principal?: string | null;
  categoria_secundaria?: string | null;
  raw_data?: Record<string, unknown> | null;
  source_kind?: string | null;
}

export interface LightFixedExpenseStatus {
  item: FixedExpense;
  state: 'paid' | 'pending' | 'unconfigured';
  payments: LightTransaction[];
  paidAmount: number;
  lastPaymentDate: string | null;
}

export interface LightCategoryTotal {
  name: string;
  amount: number;
  percentage: number;
}

const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const money = (transaction: LightTransaction) => Math.abs(Number(transaction.amount || 0));

const getKind = (transaction: LightTransaction): 'ingreso' | 'egreso' | null => {
  const sourceType = normalize(transaction.type);
  if (sourceType.includes('ingreso') || sourceType.includes('abono') || sourceType.includes('credit')) return 'ingreso';
  if (sourceType.includes('egreso') || sourceType.includes('cargo') || sourceType.includes('debit')) return 'egreso';

  const semanticType = normalize(transaction.tipo_movimiento);
  if (semanticType === 'ingreso') return 'ingreso';
  if (semanticType === 'egreso') return 'egreso';
  if (transaction.amount < 0) return 'egreso';
  if (transaction.amount > 0) return 'ingreso';
  return null;
};

const isInitialBalance = (transaction: LightTransaction) => {
  const description = normalize(`${transaction.description || ''} ${transaction.original_description || ''}`);
  return description.includes('saldo inicial');
};

export const getMonthRange = (month = new Date()) => ({
  start: new Date(month.getFullYear(), month.getMonth(), 1, 0, 0, 0, 0),
  end: new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999),
  startInput: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`,
  endInput: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()).padStart(2, '0')}`,
  label: month.toLocaleString('es-CL', { month: 'long', year: 'numeric' })
});

export const getRecentMonthOptions = (now = new Date(), previousMonths = 6) => (
  Array.from({ length: previousMonths + 1 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1, 12, 0, 0);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleString('es-CL', { month: 'long', year: 'numeric' }),
      date
    };
  })
);

export const buildMonthlyLightSummary = (
  transactions: LightTransaction[],
  fixedExpenses: FixedExpense[],
  now = new Date(),
  bankIds = Array.from(new Set(transactions.map(transaction => transaction.bank).filter((bank): bank is string => Boolean(bank))))
) => {
  const range = getMonthRange(now);
  const openingBalance = getOpeningBalanceSnapshot(transactions, range.start, bankIds);
  const monthTransactions = transactions.filter(transaction => {
    const date = parseLocalDateInput(transaction.date);
    return date >= range.start && date <= range.end;
  });
  const reportable = monthTransactions.filter(transaction => !isInitialBalance(transaction));
  const periodAnalysis = analyzeFinancialPeriod(reportable, transactions);
  const expenses = reportable.filter(transaction => classifyFinancialTreatment(transaction).economicExpense > 0);
  const incomes = reportable.filter(transaction => getKind(transaction) === 'ingreso' && !isOwnTransferMovement(transaction) && !isInvestmentMovement(transaction));
  const receivedTransfers = reportable.filter(transaction => getKind(transaction) === 'ingreso' && isOwnTransferMovement(transaction));
  const sentTransfers = reportable.filter(transaction => getKind(transaction) === 'egreso' && isOwnTransferMovement(transaction));
  const investmentRedemptions = reportable.filter(transaction => getKind(transaction) === 'ingreso' && isInvestmentMovement(transaction));
  const investmentPlacements = reportable.filter(transaction => getKind(transaction) === 'egreso' && isInvestmentMovement(transaction));
  const debtSettlements = reportable.filter(transaction => getKind(transaction) === 'egreso' && isCreditCardSettlement(transaction));
  const totalExpenses = expenses.reduce((total, transaction) => total + money(transaction), 0);
  const totalIncome = incomes.reduce((total, transaction) => total + money(transaction), 0);
  const receivedTransferAmount = receivedTransfers.reduce((total, transaction) => total + money(transaction), 0);
  const sentTransferAmount = sentTransfers.reduce((total, transaction) => total + money(transaction), 0);
  const investmentRedemptionAmount = investmentRedemptions.reduce((total, transaction) => total + money(transaction), 0);
  const investmentPlacementAmount = investmentPlacements.reduce((total, transaction) => total + money(transaction), 0);
  const debtSettlementAmount = debtSettlements.reduce((total, transaction) => total + money(transaction), 0);
  const totalAvailable = totalIncome + receivedTransferAmount;

  const categoryMap = new Map<string, number>();
  expenses.forEach(transaction => {
    const category = transaction.categoria_principal || 'Sin clasificar';
    categoryMap.set(category, (categoryMap.get(category) || 0) + money(transaction));
  });
  const categories = Array.from(categoryMap, ([name, amount]) => ({
    name,
    amount,
    percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
  })).sort((first, second) => second.amount - first.amount);

  const fixedExpenseStatuses: LightFixedExpenseStatus[] = fixedExpenses.map(item => {
    const payments = monthTransactions
      .filter(transaction => evaluateAccountMatch(transaction, item).matches)
      .sort((first, second) => parseLocalDateInput(second.date).getTime() - parseLocalDateInput(first.date).getTime());
    const configured = Boolean(item.categoria_principal);

    return {
      item,
      state: !configured ? 'unconfigured' : payments.length > 0 ? 'paid' : 'pending',
      payments,
      paidAmount: payments.reduce((total, transaction) => total + money(transaction), 0),
      lastPaymentDate: payments[0]?.date || null
    };
  });

  const paidCommitments = fixedExpenseStatuses.filter(status => status.state === 'paid');

  return {
    range,
    openingBalance,
    transactionCount: monthTransactions.length,
    totalIncome,
    receivedTransferAmount,
    sentTransferAmount,
    investmentRedemptionAmount,
    investmentPlacementAmount,
    debtSettlementAmount,
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
    totalAvailable,
    totalExpenses,
    balance: totalAvailable - totalExpenses,
    categories,
    fixedExpenseStatuses,
    paidCommitmentCount: paidCommitments.length,
    pendingCommitmentCount: fixedExpenseStatuses.filter(status => status.state === 'pending').length,
    unconfiguredCommitmentCount: fixedExpenseStatuses.filter(status => status.state === 'unconfigured').length,
    fixedPaidAmount: paidCommitments.reduce((total, status) => total + status.paidAmount, 0),
    unclassifiedExpenseCount: expenses.filter(transaction => !transaction.categoria_principal).length
  };
};
