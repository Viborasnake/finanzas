import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMonthlyLightSummary } from '../src/utils/monthlyLightView.ts';

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
    id: 'salary', date: '2026-08-01', description: 'Sueldo', amount: 2_000_000,
    type: 'ingreso', tipo_movimiento: 'Ingreso', categoria_principal: 'Sueldo'
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
    id: 'previous', date: '2026-07-31', description: 'Gasto anterior', amount: -999_999,
    type: 'egreso', tipo_movimiento: 'Egreso', categoria_principal: 'Otros'
  }
];

test('la vista Light resume exclusivamente el mes en curso y excluye movimientos internos', () => {
  const summary = buildMonthlyLightSummary(transactions, fixedExpenses, new Date(2026, 7, 15));

  assert.equal(summary.transactionCount, 4);
  assert.equal(summary.totalIncome, 2_000_000);
  assert.equal(summary.totalExpenses, 800_000);
  assert.equal(summary.balance, 1_200_000);
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
