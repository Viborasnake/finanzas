import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePeriodCashPosition, extractReportedBalance, getOpeningBalanceSnapshot } from '../src/utils/balanceSnapshot.ts';

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

test('arrastra el cierre anterior como apertura y calcula el cierre del mes recursivamente', () => {
  const opening = getOpeningBalanceSnapshot([
    { date: '2026-05-31', bank: 'Scotiabank', raw_data: { saldo: '2.000.000,00' } },
    { date: '2026-05-31', bank: 'Consorcio', raw_data: { fullLine: '31/05/2026 CIERRE $ 0 $ 500.000' } }
  ], new Date(2026, 5, 1), ['Scotiabank', 'Consorcio']);

  const position = calculatePeriodCashPosition(opening, 1_000_000, 1_600_000);
  assert.equal(position.openingBalance, 2_500_000);
  assert.equal(position.netChange, -600_000);
  assert.equal(position.closingBalance, 1_900_000);
  assert.equal(position.complete, true);
});

test('no inventa un cierre cuando ninguna cartola informa saldo de apertura', () => {
  const opening = getOpeningBalanceSnapshot([], new Date(2026, 5, 1), ['Mach']);
  const position = calculatePeriodCashPosition(opening, 100_000, 80_000);

  assert.equal(position.openingBalance, null);
  assert.equal(position.closingBalance, null);
  assert.equal(position.netChange, 20_000);
});
