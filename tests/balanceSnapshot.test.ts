import assert from 'node:assert/strict';
import test from 'node:test';
import { extractReportedBalance, getOpeningBalanceSnapshot } from '../src/utils/balanceSnapshot.ts';

test('extrae saldos informados por Scotiabank, Consorcio e Itaú', () => {
  assert.equal(extractReportedBalance({
    date: '2026-06-30', bank: 'Scotiabank', raw_data: { saldo: '-0000000083264,00\r' }
  }), -83_264);
  assert.equal(extractReportedBalance({
    date: '2026-06-29', bank: 'Consorcio', raw_data: { fullLine: '29/06/2026 TEF $ 150.000 $ 0 $ 1.179.313' }
  }), 1_179_313);
  assert.equal(extractReportedBalance({
    date: '2026-06-30', bank: 'Itaú', raw_data: { fullLine: '30/06/2026 Transferencia $ 10.000 $ 13.859' }
  }), 13_859);
});

test('consolida solo el último saldo previo y declara bancos sin información', () => {
  const snapshot = getOpeningBalanceSnapshot([
    { date: '2026-06-29', bank: 'Scotiabank', created_at: '2026-07-01T01:00:00Z', raw_data: { saldo: '100.000,00' } },
    { date: '2026-06-30', bank: 'Scotiabank', created_at: '2026-07-01T02:00:00Z', raw_data: { saldo: '80.000,00' } },
    { date: '2026-06-30', bank: 'Consorcio', raw_data: { fullLine: '30/06/2026 CARGO $ 20.000 $ 0 $ 50.000' } }
  ], new Date(2026, 6, 1), ['Scotiabank', 'Consorcio', 'Mach']);

  assert.equal(snapshot.total, 130_000);
  assert.equal(snapshot.detectedBankCount, 2);
  assert.deepEqual(snapshot.missingBanks, ['Mach']);
  assert.equal(snapshot.complete, false);
});
