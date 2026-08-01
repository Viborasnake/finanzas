import assert from 'node:assert/strict';
import test from 'node:test';
import { BASE_TAXONOMY } from '../src/utils/baseTaxonomy.ts';

test('las transferencias entrantes se clasifican como ingresos', () => {
  assert.deepEqual(
    BASE_TAXONOMY.Ingreso.Transferencias,
    ['Transferencias de Otras Personas', 'Transferencias Propias']
  );
  assert.equal(BASE_TAXONOMY['Movimiento Interno'], undefined);
  assert.deepEqual(BASE_TAXONOMY.Egreso['Transferencias Propias'], ['Transferencias Propias']);
});
