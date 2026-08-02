import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMonthlyLightSummary, getRecentMonthOptions } from '../src/utils/monthlyLightView.ts';

const fixedExpenses = [
  {
    id: 'mortgage',
    name: 'Dividendo',
    tipo_movimiento: 'Egreso',
    categoria_principal: 'Vivienda',
    categoria_secundaria: 'Dividendo'
  },
  {
    id: 'subscriptions',
    name: 'Suscripciones',
    tipo_movimiento: 'Egreso',
    categoria_principal: 'Entretenimiento',
    categoria_secundaria: 'Suscripciones'
  }
];

const transactions = [
  {
    id: 'opening', date: '2026-07-31', created_at: '2026-08-01T00:00:00Z', description: 'Último movimiento previo', amount: 50_000,
    type: 'ingreso', bank: 'Scotiabank', raw_data: { saldo: '450.000,00' }
  },
  {
    id: 'salary', date: '2026-08-01', description: 'Sueldo', amount: 2_000_000,
    type: 'ingreso', bank: 'Scotiabank', tipo_movimiento: 'Ingreso', categoria_principal: 'Sueldo'
  },
  {
    id: 'mortgage-payment', date: '2026-08-05', description: 'Pago hipotecario', amount: -600_000,
    type: 'egreso', tipo_movimiento: 'Egreso', categoria_principal: 'Vivienda', categoria_secundaria: 'Dividendo'
  },
  {
    id: 'groceries', date: '2026-08-08', description: 'Supermercado', amount: -200_000,
    type: 'egreso', tipo_movimiento: 'Egreso', categoria_principal: 'Alimentación'
  },
  {
    id: 'internal', date: '2026-08-09', description: 'Movimiento entre cuentas', amount: -300_000,
    type: 'egreso', tipo_movimiento: 'Movimiento Interno', categoria_principal: 'Transferencias'
  },
  {
    id: 'internal-income', date: '2026-08-10', description: 'Transferencia desde cuenta propia', amount: 300_000,
    type: 'ingreso', tipo_movimiento: 'Ingreso', categoria_principal: 'Transferencias', categoria_secundaria: 'Transferencias Propias'
  },
  {
    id: 'previous', date: '2026-07-31', description: 'Gasto anterior', amount: -999_999,
    type: 'egreso', tipo_movimiento: 'Egreso', categoria_principal: 'Otros'
  },
  {
    id: 'dap-placement', date: '2026-08-11', description: 'PAGO CAPTACIÓN INICIAL 552885141642', amount: -10_000_000,
    type: 'egreso', tipo_movimiento: 'Ahorro/Inversión', categoria_principal: 'Ahorro'
  },
  {
    id: 'dap-redemption', date: '2026-08-20', description: 'ABONO LIQUIDACIÓN CAPTACIÓN 552769441642', amount: 10_100_000,
    type: 'ingreso', tipo_movimiento: 'Ingreso', categoria_principal: 'Otros Ingresos'
  },
  {
    id: 'card-settlement', date: '2026-08-22', description: 'PAGO POR SWEB DE CAT ADMINISTR', amount: -400_000,
    type: 'egreso', tipo_movimiento: 'Egreso', categoria_principal: 'Pago Tarjeta Crédito', categoria_secundaria: 'Tarjeta Credito'
  }
];

test('la vista Light suma transferencias propias recibidas y excluye las enviadas de los gastos', () => {
  const summary = buildMonthlyLightSummary(transactions, fixedExpenses, new Date(2026, 7, 15), ['Scotiabank']);

  assert.equal(summary.transactionCount, 8);
  assert.equal(summary.totalIncome, 2_000_000);
  assert.equal(summary.receivedTransferAmount, 300_000);
  assert.equal(summary.sentTransferAmount, 300_000);
  assert.equal(summary.investmentPlacementAmount, 10_000_000);
  assert.equal(summary.investmentRedemptionAmount, 10_100_000);
  assert.equal(summary.debtSettlementAmount, 400_000);
  assert.equal(summary.cashInflow, 12_400_000);
  assert.equal(summary.cashOutflow, 11_500_000);
  assert.equal(summary.netCashFlow, 900_000);
  assert.equal(summary.economicIncome, 2_000_000);
  assert.equal(summary.economicExpense, 800_000);
  assert.equal(summary.cardCoverage.status, 'absent');
  assert.equal(summary.semanticWarnings.length, 2);
  assert.equal(summary.totalAvailable, 2_300_000);
  assert.equal(summary.totalExpenses, 800_000);
  assert.equal(summary.balance, 1_500_000);
  assert.equal(summary.openingBalance.total, 450_000);
  assert.equal(summary.openingBalance.complete, true);
  assert.equal(summary.estimatedClosingBalance, 1_350_000);
  assert.deepEqual(summary.categories.map(category => category.name), ['Vivienda', 'Alimentación']);
});

test('la vista Light distingue pagos importantes registrados y pendientes', () => {
  const summary = buildMonthlyLightSummary(transactions, fixedExpenses, new Date(2026, 7, 15));
  const mortgage = summary.fixedExpenseStatuses.find(status => status.item.id === 'mortgage');
  const subscriptions = summary.fixedExpenseStatuses.find(status => status.item.id === 'subscriptions');

  assert.equal(mortgage?.state, 'paid');
  assert.equal(mortgage?.paidAmount, 600_000);
  assert.equal(subscriptions?.state, 'pending');
  assert.equal(summary.paidCommitmentCount, 1);
  assert.equal(summary.pendingCommitmentCount, 1);
});

test('ofrece el mes actual y al menos los seis meses anteriores', () => {
  const months = getRecentMonthOptions(new Date(2026, 7, 1), 6);

  assert.equal(months.length, 7);
  assert.equal(months[0].key, '2026-08');
  assert.equal(months[6].key, '2026-02');
});

test('recalcula el resumen al seleccionar un mes anterior', () => {
  const july = buildMonthlyLightSummary(transactions, fixedExpenses, new Date(2026, 6, 1));

  assert.equal(july.transactionCount, 2);
  assert.equal(july.totalExpenses, 999_999);
  assert.equal(july.totalIncome, 50_000);
});
