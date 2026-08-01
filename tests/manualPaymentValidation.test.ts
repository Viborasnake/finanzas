import test from 'node:test';
import assert from 'node:assert/strict';
import { hasManualPaymentErrors, validateManualPayment } from '../src/utils/manualPaymentValidation.ts';

const baseInput = {
  amount: '13956',
  date: '2026-07-07',
  bank: 'Scotiabank',
  allowedBanks: ['Scotiabank'],
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31'
};

test('valida un pago manual completo dentro del periodo', () => {
  assert.equal(hasManualPaymentErrors(validateManualPayment(baseInput)), false);
});

test('rechaza montos no positivos, fechas fuera del periodo y bancos desconectados', () => {
  const errors = validateManualPayment({
    ...baseInput,
    amount: '0',
    date: '2026-08-01',
    bank: 'Mach'
  });

  assert.match(errors.amount, /mayor/);
  assert.match(errors.date, /periodo/);
  assert.match(errors.bank, /conectados/);
});
