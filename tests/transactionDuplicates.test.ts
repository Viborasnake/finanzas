import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDuplicateReviewGroups, getBatchDuplicateDeleteIds } from '../src/utils/transactionDuplicates.ts';

const base = {
  bank: 'Scotiabank',
  date: '2026-07-08',
  amount: 30000,
  type: 'egreso',
  description: 'PAC AUTOPISTA',
  candidate_fingerprint: 'SCOTIABANK|2026-07-08|30000.00|EGRESO|pac autopista'
};

test('detecta movimientos equivalentes sin recomendar un borrado débil', () => {
  const groups = buildDuplicateReviewGroups([
    { ...base, id: 'old', created_at: '2026-07-09T10:00:00Z' },
    { ...base, id: 'new', created_at: '2026-07-10T10:00:00Z' }
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].keepEntryKey, 'transaction:old');
  assert.deepEqual(groups[0].recommendedDeleteIds, []);
});

test('el lote conserva un movimiento por grupo y elimina solamente los restantes', () => {
  const groups = buildDuplicateReviewGroups([
    { ...base, id: 'old', created_at: '2026-07-09T10:00:00Z' },
    { ...base, id: 'new-1', created_at: '2026-07-10T10:00:00Z' },
    { ...base, id: 'new-2', created_at: '2026-07-11T10:00:00Z' }
  ]);

  assert.equal(groups[0].keepEntryKey, 'transaction:old');
  assert.deepEqual(getBatchDuplicateDeleteIds(groups), ['new-1', 'new-2']);
});

test('colapsa las partes divididas y recomienda conservar el grupo procesado', () => {
  const splitRaw = {
    split_group_id: 'split-1',
    original_amount: 30000,
    original_date: '2026-07-08',
    original_description: 'PAC AUTOPISTA',
    _source: { candidate_fingerprint: base.candidate_fingerprint }
  };
  const groups = buildDuplicateReviewGroups([
    { ...base, id: 'split-root', amount: -15000, date: '2026-06-30', raw_data: splitRaw },
    { ...base, id: 'split-child', amount: -15000, date: '2026-07-31', raw_data: { ...splitRaw, is_split_child: true } },
    { ...base, id: 'reimported', created_at: '2026-07-12T10:00:00Z' }
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].keepEntryKey, 'split:split-1');
  assert.deepEqual(groups[0].recommendedDeleteIds, ['reimported']);
  assert.equal(groups[0].entries.length, 2);
  assert.equal(groups[0].containsSplit, true);
});

test('no agrupa movimientos con una descripción distinta', () => {
  const groups = buildDuplicateReviewGroups([
    { ...base, id: 'first', candidate_fingerprint: null },
    { ...base, id: 'second', description: 'PAC AGUA', candidate_fingerprint: null }
  ]);

  assert.equal(groups.length, 0);
});
