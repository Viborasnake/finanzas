export interface SemanticTransaction {
  id?: string | null;
  date?: string | null;
  amount?: number | null;
  type?: string | null;
  bank?: string | null;
  source_kind?: string | null;
  description?: string | null;
  original_description?: string | null;
  tipo_movimiento?: string | null;
  categoria_principal?: string | null;
  categoria_secundaria?: string | null;
  raw_data?: Record<string, unknown> | null;
}

export type TransactionKind = 'ingreso' | 'egreso' | null;
export type FinancialEventType =
  | 'income'
  | 'consumption'
  | 'own_transfer'
  | 'investment_placement'
  | 'investment_redemption'
  | 'credit_card_settlement'
  | 'loan_principal'
  | 'loan_finance_cost'
  | 'loan_installment_unallocated'
  | 'initial_balance'
  | 'unknown';

export type SemanticConfidence = 'exact' | 'reconciled' | 'estimated' | 'unknown';
export type CardCoverageStatus = 'complete' | 'partial' | 'absent' | 'not_applicable';

export interface FinancialTreatment {
  eventType: FinancialEventType;
  kind: TransactionKind;
  amount: number;
  cashInflow: number;
  cashOutflow: number;
  economicIncome: number;
  economicExpense: number;
  assetImpact: number;
  liabilityImpact: number;
  confidence: SemanticConfidence;
  warnings: string[];
}

export interface CardCoverageAssessment {
  status: CardCoverageStatus;
  settlementAmount: number;
  importedPurchaseAmount: number;
  difference: number;
  message: string | null;
}

export interface FinancialPeriodAnalysis {
  treatments: Map<string | SemanticTransaction, FinancialTreatment>;
  totals: {
    cashInflow: number;
    cashOutflow: number;
    netCashFlow: number;
    economicIncome: number;
    economicExpense: number;
    economicResult: number;
    ownTransferInflow: number;
    ownTransferOutflow: number;
    investmentInflow: number;
    investmentOutflow: number;
    debtSettlementOutflow: number;
    loanPrincipalOutflow: number;
    loanFinanceCost: number;
    unallocatedLoanOutflow: number;
  };
  cardCoverage: CardCoverageAssessment;
  warnings: string[];
}

export const normalizeSemanticText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const INVESTMENT_DESCRIPTION_MARKERS = [
  'abono liquidacion captacion',
  'liquidacion captacion',
  'pago captacion inicial',
  'constitucion captacion',
  'deposito a plazo',
  'rescate dap',
  'vencimiento dap',
  'renovacion dap'
];

const LOAN_PRINCIPAL_MARKERS = [
  'capital de credito',
  'amortizacion de capital',
  'reduccion de deuda',
  'abono a capital',
  'abono linea de credito'
];

const LOAN_COST_MARKERS = [
  'intereses de credito',
  'interes de credito',
  'interes linea de credito',
  'seguro de credito',
  'seguros y comisiones',
  'comisiones de credito'
];

const getSemanticDescription = (transaction: SemanticTransaction) => normalizeSemanticText(
  `${transaction.description || ''} ${transaction.original_description || ''}`
);

const getSemanticCategories = (transaction: SemanticTransaction) => ({
  movementType: normalizeSemanticText(transaction.tipo_movimiento),
  principal: normalizeSemanticText(transaction.categoria_principal),
  secondary: normalizeSemanticText(transaction.categoria_secundaria)
});

export const getSemanticTransactionKind = (transaction: SemanticTransaction): TransactionKind => {
  const sourceType = normalizeSemanticText(transaction.type);
  if (sourceType.includes('ingreso') || sourceType.includes('abono') || sourceType.includes('credit')) return 'ingreso';
  if (sourceType.includes('egreso') || sourceType.includes('cargo') || sourceType.includes('debit')) return 'egreso';

  const movementType = normalizeSemanticText(transaction.tipo_movimiento);
  if (movementType === 'ingreso') return 'ingreso';
  if (movementType === 'egreso') return 'egreso';
  if (Number(transaction.amount || 0) < 0) return 'egreso';
  if (Number(transaction.amount || 0) > 0) return 'ingreso';
  return null;
};

export const isInitialBalanceMovement = (transaction: SemanticTransaction) => {
  const { secondary } = getSemanticCategories(transaction);
  return secondary === 'saldo inicial' || getSemanticDescription(transaction).includes('saldo inicial');
};

export const isInvestmentMovement = (transaction: SemanticTransaction) => {
  const { movementType, principal } = getSemanticCategories(transaction);
  const description = getSemanticDescription(transaction);

  return movementType === 'ahorro/inversion'
    || principal === 'ahorro/inversion'
    || INVESTMENT_DESCRIPTION_MARKERS.some(marker => description.includes(marker));
};

export const isOwnTransferMovement = (transaction: SemanticTransaction) => {
  if (isInvestmentMovement(transaction)) return false;
  const { movementType, secondary } = getSemanticCategories(transaction);

  return movementType === 'movimiento interno'
    || secondary === 'transferencias propias'
    || secondary === 'transferencia personal';
};

export const isCreditCardSettlement = (transaction: SemanticTransaction) => {
  const { principal, secondary } = getSemanticCategories(transaction);
  const description = getSemanticDescription(transaction);

  return principal === 'pago tarjeta credito'
    || secondary === 'tarjeta credito'
    || description.includes('pago tarjeta de credito')
    || description.includes('pago tarjeta credito');
};

export const isLoanPrincipalRepayment = (transaction: SemanticTransaction) => {
  const { principal, secondary } = getSemanticCategories(transaction);
  const categories = `${principal} ${secondary}`;
  return LOAN_PRINCIPAL_MARKERS.some(marker => categories.includes(marker));
};

export const isLoanFinanceCost = (transaction: SemanticTransaction) => {
  const { principal, secondary } = getSemanticCategories(transaction);
  const categories = `${principal} ${secondary}`;
  return LOAN_COST_MARKERS.some(marker => categories.includes(marker));
};

export const isLoanInstallment = (transaction: SemanticTransaction) => {
  if (isCreditCardSettlement(transaction) || isLoanPrincipalRepayment(transaction) || isLoanFinanceCost(transaction)) return false;
  const { principal, secondary } = getSemanticCategories(transaction);
  const description = getSemanticDescription(transaction);
  const categories = `${principal} ${secondary}`;

  return principal === 'creditos'
    || principal === 'servicio de deuda'
    || secondary === 'dividendo'
    || categories.includes('credito consumo')
    || categories.includes('credito hipotecario')
    || categories.includes('cuota sin desglose')
    || description.includes('cuota credito')
    || description.includes('pago hipotecario');
};

export const isImportedCardPurchase = (transaction: SemanticTransaction) => {
  const rawSource = transaction.raw_data?._source;
  const rawKind = rawSource && typeof rawSource === 'object' && 'kind' in rawSource
    ? String((rawSource as Record<string, unknown>).kind || '')
    : '';
  return normalizeSemanticText(transaction.source_kind || rawKind) === 'card_activity_screenshot';
};

export const classifyFinancialTreatment = (
  transaction: SemanticTransaction,
  hasCardCoverage = false
): FinancialTreatment => {
  const kind = getSemanticTransactionKind(transaction);
  const amount = Math.abs(Number(transaction.amount || 0));
  const base = {
    kind,
    amount,
    cashInflow: kind === 'ingreso' ? amount : 0,
    cashOutflow: kind === 'egreso' ? amount : 0,
    economicIncome: 0,
    economicExpense: 0,
    assetImpact: 0,
    liabilityImpact: 0,
    confidence: 'exact' as SemanticConfidence,
    warnings: [] as string[]
  };

  if (isInitialBalanceMovement(transaction)) return { ...base, eventType: 'initial_balance', cashInflow: 0, cashOutflow: 0 };

  if (isInvestmentMovement(transaction)) {
    return kind === 'ingreso'
      ? { ...base, eventType: 'investment_redemption', assetImpact: -amount }
      : { ...base, eventType: 'investment_placement', assetImpact: amount };
  }

  if (isOwnTransferMovement(transaction)) {
    return {
      ...base,
      eventType: 'own_transfer',
      economicIncome: kind === 'ingreso' ? amount : 0
    };
  }

  if (kind === 'egreso' && isCreditCardSettlement(transaction)) {
    return { ...base, eventType: 'credit_card_settlement', liabilityImpact: -amount, economicExpense: hasCardCoverage ? 0 : amount, confidence: 'unknown' };
  }

  if (kind === 'egreso' && isLoanPrincipalRepayment(transaction)) {
    return { ...base, eventType: 'loan_principal', liabilityImpact: -amount };
  }

  if (kind === 'egreso' && isLoanFinanceCost(transaction)) {
    return { ...base, eventType: 'loan_finance_cost', economicExpense: amount };
  }

  if (kind === 'egreso' && isLoanInstallment(transaction)) {
    return {
      ...base,
      eventType: 'loan_installment_unallocated',
      economicExpense: amount,
      confidence: 'unknown',
      warnings: ['Esta cuota mezcla capital y costos financieros. Se mantiene completa como gasto hasta que sea desglosada.']
    };
  }

  if (kind === 'ingreso') return { ...base, eventType: 'income', economicIncome: amount };
  if (kind === 'egreso') return { ...base, eventType: 'consumption', economicExpense: amount };
  return { ...base, eventType: 'unknown', confidence: 'unknown', warnings: ['No fue posible determinar el efecto financiero del movimiento.'] };
};

const normalizeBank = (value: unknown) => normalizeSemanticText(value).replace(/[^a-z0-9]/g, '');

const parseSemanticDate = (value: string | null | undefined) => {
  if (!value) return null;
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
};

export const assessCardCoverage = (
  periodTransactions: SemanticTransaction[],
  contextTransactions: SemanticTransaction[] = periodTransactions
): CardCoverageAssessment => {
  const settlements = periodTransactions.filter(transaction => (
    getSemanticTransactionKind(transaction) === 'egreso' && isCreditCardSettlement(transaction)
  ));
  const settlementAmount = settlements.reduce((total, transaction) => total + Math.abs(Number(transaction.amount || 0)), 0);

  if (settlementAmount === 0) {
    return { status: 'not_applicable', settlementAmount: 0, importedPurchaseAmount: 0, difference: 0, message: null };
  }

  const settlementBanks = new Set(settlements.map(transaction => normalizeBank(transaction.bank)).filter(Boolean));
  const settlementDates = settlements
    .map(transaction => parseSemanticDate(transaction.date))
    .filter((date): date is Date => Boolean(date));
  const earliestSettlement = settlementDates.length > 0
    ? new Date(Math.min(...settlementDates.map(date => date.getTime())))
    : null;
  const latestSettlement = settlementDates.length > 0
    ? new Date(Math.max(...settlementDates.map(date => date.getTime())))
    : null;
  const coverageStart = earliestSettlement
    ? new Date(earliestSettlement.getFullYear(), earliestSettlement.getMonth() - 2, earliestSettlement.getDate())
    : null;
  const coverageEnd = latestSettlement
    ? new Date(latestSettlement.getFullYear(), latestSettlement.getMonth(), latestSettlement.getDate(), 23, 59, 59)
    : null;
  const importedPurchases = contextTransactions.filter(transaction => {
    if (!isImportedCardPurchase(transaction) || getSemanticTransactionKind(transaction) !== 'egreso') return false;
    if (settlementBanks.size === 0) return true;
    if (!settlementBanks.has(normalizeBank(transaction.bank))) return false;
    const purchaseDate = parseSemanticDate(transaction.date);
    return !purchaseDate || !coverageStart || !coverageEnd || (purchaseDate >= coverageStart && purchaseDate <= coverageEnd);
  });
  const importedPurchaseAmount = importedPurchases.reduce((total, transaction) => total + Math.abs(Number(transaction.amount || 0)), 0);
  const difference = Math.abs(settlementAmount - importedPurchaseAmount);
  const tolerance = Math.max(1_000, settlementAmount * 0.02);

  if (importedPurchaseAmount === 0) {
    return {
      status: 'absent', settlementAmount, importedPurchaseAmount, difference,
      message: null
    };
  }

  if (difference <= tolerance) {
    return {
      status: 'complete', settlementAmount, importedPurchaseAmount, difference,
      message: `Pagos de tarjeta conciliados con ${formatSemanticMoney(importedPurchaseAmount)} en compras importadas.`
    };
  }

  return {
    status: 'partial', settlementAmount, importedPurchaseAmount, difference,
    message: `Las compras importadas (${formatSemanticMoney(importedPurchaseAmount)}) no coinciden con los pagos de tarjeta (${formatSemanticMoney(settlementAmount)}). Revisa una diferencia de ${formatSemanticMoney(difference)}.`
  };
};

const formatSemanticMoney = (amount: number) => `$${Math.round(amount).toLocaleString('es-CL')}`;

export const analyzeFinancialPeriod = (
  periodTransactions: SemanticTransaction[],
  contextTransactions: SemanticTransaction[] = periodTransactions
): FinancialPeriodAnalysis => {
  const treatments = new Map<string | SemanticTransaction, FinancialTreatment>();
  const totals = {
    cashInflow: 0,
    cashOutflow: 0,
    netCashFlow: 0,
    economicIncome: 0,
    economicExpense: 0,
    economicResult: 0,
    ownTransferInflow: 0,
    ownTransferOutflow: 0,
    investmentInflow: 0,
    investmentOutflow: 0,
    debtSettlementOutflow: 0,
    loanPrincipalOutflow: 0,
    loanFinanceCost: 0,
    unallocatedLoanOutflow: 0
  };
  const warnings = new Set<string>();

  const cardCoverage = assessCardCoverage(periodTransactions, contextTransactions);
  const hasCardCoverage = cardCoverage.status !== 'absent' && cardCoverage.status !== 'not_applicable';

  periodTransactions.forEach(transaction => {
    const treatment = classifyFinancialTreatment(transaction, hasCardCoverage);
    treatments.set(transaction.id || transaction, treatment);
    totals.cashInflow += treatment.cashInflow;
    totals.cashOutflow += treatment.cashOutflow;
    totals.economicIncome += treatment.economicIncome;
    totals.economicExpense += treatment.economicExpense;
    treatment.warnings.forEach(warning => warnings.add(warning));

    if (treatment.eventType === 'own_transfer') {
      if (treatment.kind === 'ingreso') totals.ownTransferInflow += treatment.amount;
      if (treatment.kind === 'egreso') totals.ownTransferOutflow += treatment.amount;
    }
    if (treatment.eventType === 'investment_redemption') totals.investmentInflow += treatment.amount;
    if (treatment.eventType === 'investment_placement') totals.investmentOutflow += treatment.amount;
    if (treatment.eventType === 'credit_card_settlement') totals.debtSettlementOutflow += treatment.amount;
    if (treatment.eventType === 'loan_principal') totals.loanPrincipalOutflow += treatment.amount;
    if (treatment.eventType === 'loan_finance_cost') totals.loanFinanceCost += treatment.amount;
    if (treatment.eventType === 'loan_installment_unallocated') totals.unallocatedLoanOutflow += treatment.amount;
  });

  totals.netCashFlow = totals.cashInflow - totals.cashOutflow;
  totals.economicResult = totals.economicIncome - totals.economicExpense;
  if (cardCoverage.status === 'partial') warnings.add(cardCoverage.message!);

  return { treatments, totals, cardCoverage, warnings: Array.from(warnings) };
};
