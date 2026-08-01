import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalDateInput, toLocalDateInput } from '../src/utils/localDate.ts';

test('conserva el día exacto al leer una fecha sin zona horaria', () => {
  const date = parseLocalDateInput('2025-01-01');
  assert.equal(date.getFullYear(), 2025);
  assert.equal(date.getMonth(), 0);
  assert.equal(date.getDate(), 1);
  assert.equal(toLocalDateInput(date), '2025-01-01');
});

test('ignora la hora cuando la base contiene un timestamp', () => {
  assert.equal(toLocalDateInput(parseLocalDateInput('2024-12-31T00:00:00.000Z')), '2024-12-31');
});
