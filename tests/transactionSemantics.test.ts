import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeFinancialPeriod,
  assessCardCoverage,
  classifyFinancialTreatment,
  isCreditCardSettlement,
  isInvestmentMovement,
  isLoanInstallment,
  isLoanPrincipalRepayment,
  isOwnTransferMovement
} from '../src/utils/transactionSemantics.ts';

test('detecta la liquidación de un DAP aunque esté clasificada como ingreso', () => {
  assert.equal(isInvestmentMovement({
    description: 'ABONO LIQUIDACIÓN CAPTACIÓN 552769441642',
    tipo_movimiento: 'Ingreso',
    categoria_principal: 'Otros Ingresos'
  }), true);
});

test('considera colocación y rescate como inversión, no transferencia propia', () => {
  const placement = { description: 'PAGO CAPTACIÓN INICIAL 552885141642', tipo_movimiento: 'Ahorro/Inversión' };
  const redemption = { description: 'ABONO LIQUIDACIÓN CAPTACIÓN 552769441642', tipo_movimiento: 'Ahorro/Inversión' };

  assert.equal(isInvestmentMovement(placement), true);
  assert.equal(isInvestmentMovement(redemption), true);
  assert.equal(isOwnTransferMovement(placement), false);
  assert.equal(isOwnTransferMovement(redemption), false);
});

test('mantiene las transferencias propias separadas de las inversiones', () => {
  const received = {
    amount: 300_000,
    type: 'ingreso',
    tipo_movimiento: 'Ingreso',
    categoria_secundaria: 'Transferencias Propias'
  };
  const sent = { ...received, amount: -300_000, type: 'egreso', tipo_movimiento: 'Egreso' };

  assert.equal(isOwnTransferMovement(received), true);
  assert.equal(classifyFinancialTreatment(received).economicIncome, 300_000);
  assert.equal(classifyFinancialTreatment(sent).economicExpense, 0);
});

test('detecta el pago de tarjeta como liquidación de deuda y no como consumo nuevo', () => {
  assert.equal(isCreditCardSettlement({
    description: 'PAGO POR SWEB DE CAT ADMINISTR',
    tipo_movimiento: 'Egreso',
    categoria_principal: 'Pago Tarjeta Crédito',
    categoria_secundaria: 'Tarjeta Credito'
  }), true);
});

test('separa salida de caja, gasto financiero y reducción de capital al dividir una cuota', () => {
  const capital = {
    id: 'capital', date: '2026-07-05', amount: -650_000, type: 'egreso',
    tipo_movimiento: 'Egreso', categoria_principal: 'Servicio de Deuda', categoria_secundaria: 'Capital de Crédito'
  };
  const interest = {
    id: 'interest', date: '2026-07-05', amount: -105_000, type: 'egreso',
    tipo_movimiento: 'Egreso', categoria_principal: 'Servicio de Deuda', categoria_secundaria: 'Intereses de Crédito'
  };
  const fees = {
    id: 'fees', date: '2026-07-05', amount: -29_587, type: 'egreso',
    tipo_movimiento: 'Egreso', categoria_principal: 'Servicio de Deuda', categoria_secundaria: 'Seguros y Comisiones'
  };

  assert.equal(isLoanPrincipalRepayment(capital), true);
  const analysis = analyzeFinancialPeriod([capital, interest, fees]);
  assert.equal(analysis.totals.cashOutflow, 784_587);
  assert.equal(analysis.totals.loanPrincipalOutflow, 650_000);
  assert.equal(analysis.totals.loanFinanceCost, 134_587);
  assert.equal(analysis.totals.economicExpense, 134_587);
});

test('un abono a línea de crédito reduce deuda sin convertirse en consumo nuevo', () => {
  const repayment = {
    id: 'credit-line-payment', date: '2026-06-30', amount: -119_252, type: 'egreso',
    description: 'ABONO A L.CREDITO POR SGO',
    tipo_movimiento: 'Egreso', categoria_principal: 'Servicio de Deuda', categoria_secundaria: 'Abono Línea de Crédito'
  };

  assert.equal(isLoanPrincipalRepayment(repayment), true);
  const treatment = classifyFinancialTreatment(repayment);
  assert.equal(treatment.eventType, 'loan_principal');
  assert.equal(treatment.cashOutflow, 119_252);
  assert.equal(treatment.economicExpense, 0);
  assert.equal(treatment.liabilityImpact, -119_252);
});

test('mantiene una cuota no desglosada como gasto conservador y genera advertencia', () => {
  const installment = {
    id: 'mortgage', date: '2026-07-05', amount: -784_587, type: 'egreso',
    tipo_movimiento: 'Egreso', categoria_principal: 'Créditos', categoria_secundaria: 'Crédito Hipotecario'
  };

  assert.equal(isLoanInstallment(installment), true);
  const treatment = classifyFinancialTreatment(installment);
  assert.equal(treatment.eventType, 'loan_installment_unallocated');
  assert.equal(treatment.cashOutflow, 784_587);
  assert.equal(treatment.economicExpense, 784_587);
  assert.equal(treatment.confidence, 'unknown');
  assert.equal(treatment.warnings.length, 1);
});

test('detecta cobertura completa cuando compras importadas concilian con el pago de tarjeta', () => {
  const settlement = {
    id: 'payment', date: '2026-07-05', amount: -500_000, type: 'egreso', bank: 'Scotiabank',
    categoria_principal: 'Pago Tarjeta Crédito', categoria_secundaria: 'Tarjeta Credito'
  };
  const purchases = [
    { id: 'one', date: '2026-06-10', amount: -300_000, type: 'egreso', bank: 'Scotiabank', source_kind: 'card_activity_screenshot' },
    { id: 'two', date: '2026-06-18', amount: -200_000, type: 'egreso', bank: 'Scotiabank', raw_data: { _source: { kind: 'card_activity_screenshot' } } }
  ];

  const coverage = assessCardCoverage([settlement], [settlement, ...purchases]);
  assert.equal(coverage.status, 'complete');
  assert.equal(coverage.difference, 0);
});

test('un pago de tarjeta sin compras importadas se cuenta como consumo directo sin advertir', () => {
  const settlement = {
    id: 'payment', date: '2026-07-05', amount: -500_000, type: 'egreso', bank: 'Scotiabank',
    categoria_principal: 'Pago Tarjeta Crédito', categoria_secundaria: 'Tarjeta Credito'
  };
  const analysis = analyzeFinancialPeriod([settlement]);

  assert.equal(analysis.totals.cashOutflow, 500_000);
  assert.equal(analysis.totals.economicExpense, 500_000);
  assert.equal(analysis.totals.debtSettlementOutflow, 500_000);
  assert.equal(analysis.cardCoverage.status, 'absent');
  assert.equal(analysis.warnings.length, 0);
});

test('los servicios pagados se mantienen como consumo y salida de caja', () => {
  const electricity = {
    id: 'electricity', date: '2026-07-12', amount: -45_000, type: 'egreso',
    tipo_movimiento: 'Egreso', categoria_principal: 'Cuentas Básicas', categoria_secundaria: 'Luz'
  };
  const treatment = classifyFinancialTreatment(electricity);

  assert.equal(treatment.eventType, 'consumption');
  assert.equal(treatment.cashOutflow, 45_000);
  assert.equal(treatment.economicExpense, 45_000);
});
