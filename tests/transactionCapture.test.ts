import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractCardLast4,
  findPotentialCaptureDuplicates,
  normalizeCaptureMerchant,
  parseCaptureAmount,
  parseCaptureTransactions,
  resolveCaptureDate,
  type CaptureOcrLine
} from '../src/utils/transactionCapture.ts';

const line = (text: string, y0: number, confidence = 95): CaptureOcrLine => ({
  text,
  confidence,
  bbox: { x0: 10, y0, x1: 900, y1: y0 + 36 }
});

test('parses Chilean and foreign currency amounts without treating thousands as decimals', () => {
  assert.deepEqual(parseCaptureAmount('BALI MARKET $4.450'), {
    amount: 4450,
    currency: 'CLP',
    raw: '$4.450',
    index: 12
  });
  assert.equal(parseCaptureAmount('Compra USD 12,50')?.amount, 12.5);
  assert.equal(parseCaptureAmount('Compra EUR 1.234,56')?.amount, 1234.56);
  assert.equal(parseCaptureAmount('Tarjeta 1918'), null);
});

test('resolves relative Spanish dates against the user-confirmed capture date', () => {
  assert.deepEqual(resolveCaptureDate('Ayer', '2026-07-15'), { date: '2026-07-14', resolution: 'relative' });
  assert.deepEqual(resolveCaptureDate('Lunes', '2026-07-15'), { date: '2026-07-13', resolution: 'relative' });
  assert.deepEqual(resolveCaptureDate('Viernes', '2026-07-15'), { date: '2026-07-10', resolution: 'relative' });
  assert.deepEqual(resolveCaptureDate('08-07-26', '2026-07-15'), { date: '2026-07-08', resolution: 'explicit' });
});

test('normalizes payment processors while retaining the original description separately', () => {
  assert.deepEqual(normalizeCaptureMerchant('SumUp * BALI MARKET SP'), {
    merchant: 'Bali Market',
    processor: 'SumUp'
  });
  assert.deepEqual(normalizeCaptureMerchant('Mercadopago*dany'), {
    merchant: 'dany',
    processor: 'Mercado Pago'
  });
});

test('extracts the card suffix only from the header area', () => {
  const lines = [
    line('10:37', 20),
    line('o 1918 0', 100),
    line('BALI MARKET $4.450', 400),
    line('Compra 2026 $1.000', 600)
  ];
  assert.equal(extractCardLast4(lines), '1918');
});

test('parses every visible Wallet row and preserves same-merchant purchases as separate candidates', () => {
  const lines = [
    line('o 1918 0', 80),
    line('Transacciones recientes', 300),
    line('SumUp * BALI MARKET SP $4.450', 420),
    line('San Miguel, Región Metropolitana...', 465),
    line('Ayer', 510),
    line('SumUp * BALI MARKET SP $3.000', 610),
    line('San Miguel, Región Metropolitana...', 655),
    line('Ayer', 700),
    line('Palmarito minimarket $1.590', 800),
    line('San Miguel, Región Metropolitana...', 845),
    line('Lunes', 890),
    line('Mercadopago*dany $1.000', 990),
    line('San Miguel, Región Metropolitana...', 1035),
    line('Viernes', 1080),
    line('Mercadopago*comercialgold $5.400', 1180),
    line('Cerrillos, Región Metropolitana...', 1225),
    line('Viernes', 1270),
    line('Bazar Claudia $2.700', 1370),
    line('San Miguel, Región Metropolitana...', 1415),
    line('Viernes', 1460),
    line('Saba Estacionamientos $3.600', 1560),
    line('La Florida, Región Metropolitana...', 1605),
    line('08-07-26', 1650),
    line('14086-Bk Plaza Vespuci $11.100', 1750),
    line('La Florida, Región Metropolitana...', 1795),
    line('08-07-26', 1840)
  ];

  const result = parseCaptureTransactions(lines, '2026-07-15');
  assert.equal(result.cardLast4, '1918');
  assert.equal(result.candidates.length, 8);
  assert.deepEqual(result.candidates.map(candidate => candidate.amount), [4450, 3000, 1590, 1000, 5400, 2700, 3600, 11100]);
  assert.deepEqual(result.candidates.map(candidate => candidate.date), [
    '2026-07-14',
    '2026-07-14',
    '2026-07-13',
    '2026-07-10',
    '2026-07-10',
    '2026-07-10',
    '2026-07-08',
    '2026-07-08'
  ]);
  assert.equal(result.candidates[0].normalizedMerchant, 'Bali Market');
  assert.equal(result.candidates[1].normalizedMerchant, 'Bali Market');
  assert.notEqual(result.candidates[0].sourceRowKey, result.candidates[1].sourceRowKey);
});

test('recovers a merchant when OCR separates the amount into a second line on the same visual row', () => {
  const lines: CaptureOcrLine[] = [
    { text: 'Bazar Claudia', confidence: 92, bbox: { x0: 20, y0: 100, x1: 400, y1: 140 } },
    { text: '$2.700', confidence: 96, bbox: { x0: 760, y0: 102, x1: 900, y1: 140 } },
    line('San Miguel', 150),
    line('Viernes', 190)
  ];

  const result = parseCaptureTransactions(lines, '2026-07-15');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].description, 'Bazar Claudia');
  assert.equal(result.candidates[0].amount, 2700);
  assert.equal(result.candidates[0].date, '2026-07-10');
});

test('does not flag a duplicate using date and amount without a matching description', () => {
  const candidate = parseCaptureTransactions([
    line('Bazar Claudia $2.700', 100),
    line('15-07-26', 150)
  ], '2026-07-15').candidates[0];

  const matches = findPotentialCaptureDuplicates(candidate, [{
    id: 'existing-1',
    date: '2026-07-15T00:00:00.000Z',
    description: 'Saba Estacionamientos',
    amount: -2700,
    bank: 'scotiabank',
    type: 'egreso'
  }]);

  assert.equal(matches.length, 0);
});

test('uses the original source description when comparing a normalized merchant', () => {
  const candidate = parseCaptureTransactions([
    line('SumUp * BALI MARKET SP $4.450', 100),
    line('15-07-26', 150)
  ], '2026-07-15').candidates[0];

  const matches = findPotentialCaptureDuplicates(candidate, [{
    id: 'existing-1',
    date: '2026-07-15',
    description: 'Bali Market',
    originalDescription: 'SUMUP * BALI MARKET SP',
    amount: 4450,
    bank: 'scotiabank',
    type: 'egreso'
  }]);

  assert.deepEqual(matches.map(match => match.id), ['existing-1']);
});

test('keeps same-merchant same-day matches as review candidates instead of auto-deduplicating', () => {
  const candidate = parseCaptureTransactions([
    line('BALI MARKET $3.000', 100),
    line('15-07-26', 150)
  ], '2026-07-15').candidates[0];
  const existing = ['purchase-a', 'purchase-b'].map(id => ({
    id,
    date: '2026-07-15',
    description: 'BALI MARKET',
    amount: 3000,
    bank: 'scotiabank',
    type: 'egreso'
  }));

  const matches = findPotentialCaptureDuplicates(candidate, existing);

  assert.deepEqual(matches.map(match => match.id), ['purchase-a', 'purchase-b']);
});

test('flags a cross-source merchant alias within the short posting-date window', () => {
  const candidate = parseCaptureTransactions([
    line('Palmarito minimarket $1.590', 100),
    line('13-07-26', 150)
  ], '2026-07-15').candidates[0];

  const matches = findPotentialCaptureDuplicates(candidate, [{
    id: 'statement-palmarito',
    date: '2026-07-14',
    description: 'REDCOMPRA PALMARITO SPA SAN',
    originalDescription: 'REDCOMPRA PALMARITO SPA SAN MIGUEL',
    amount: -1590,
    bank: 'scotiabank',
    type: 'egreso',
    sourceKind: 'statement_import'
  }]);

  assert.deepEqual(matches.map(match => match.id), ['statement-palmarito']);
  assert.equal(matches[0].dateDistanceDays, 1);
  assert.deepEqual(matches[0].sharedMerchantTokens, ['palmarito']);
});

test('does not flag a nearby transaction when only its amount matches', () => {
  const candidate = parseCaptureTransactions([
    line('Palmarito minimarket $1.590', 100),
    line('13-07-26', 150)
  ], '2026-07-15').candidates[0];

  const matches = findPotentialCaptureDuplicates(candidate, [{
    id: 'unrelated-purchase',
    date: '2026-07-14',
    description: 'SABA ESTACIONAMIENTOS',
    amount: -1590,
    bank: 'scotiabank',
    type: 'egreso'
  }]);

  assert.equal(matches.length, 0);
});

test('does not flag a merchant match outside the posting-date review window', () => {
  const candidate = parseCaptureTransactions([
    line('Palmarito minimarket $1.590', 100),
    line('13-07-26', 150)
  ], '2026-07-15').candidates[0];

  const matches = findPotentialCaptureDuplicates(candidate, [{
    id: 'older-palmarito',
    date: '2026-07-09',
    description: 'REDCOMPRA PALMARITO SPA',
    amount: -1590,
    bank: 'scotiabank',
    type: 'egreso'
  }]);

  assert.equal(matches.length, 0);
});
