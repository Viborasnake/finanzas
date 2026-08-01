import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignStatementOriginIdentities,
  buildStrongTransactionIdentity,
  buildTransactionCandidateFingerprint,
  hashImportFile,
  partitionByStrongIdentity
} from '../src/utils/transactionIdentity.ts';

const baseMovement = {
  bank: 'Scotiabank',
  date: '2026-07-07',
  amount: 13956,
  type: 'egreso',
  originalDescription: 'PAC AGUA 8795K'
};

test('usa el identificador estable de la fuente como identidad fuerte', () => {
  assert.equal(buildStrongTransactionIdentity({
    ...baseMovement,
    sourceTransactionId: ' op-001 '
  }), 'external:SCOTIABANK:OP-001');
});

test('usa archivo y fila física cuando no existe identificador externo', () => {
  assert.equal(buildStrongTransactionIdentity({
    ...baseMovement,
    sourceFileHash: 'ABC123',
    sourceRowKey: 'row:42'
  }), 'file-row:SCOTIABANK:abc123:ROW:42');
});

test('no considera fecha, monto y descripción como identidad fuerte', () => {
  assert.equal(buildStrongTransactionIdentity(baseMovement), null);
});

test('omite la repetición exacta de una misma fila de archivo', () => {
  const row = {
    ...baseMovement,
    sourceFileHash: 'abc123',
    sourceRowKey: 'row:42'
  };
  const result = partitionByStrongIdentity([row, { ...row }]);

  assert.equal(result.accepted.length, 1);
  assert.equal(result.repeated.length, 1);
});

test('conserva movimientos legítimos iguales cuando provienen de filas distintas', () => {
  const result = partitionByStrongIdentity([
    { ...baseMovement, sourceFileHash: 'abc123', sourceRowKey: 'row:42' },
    { ...baseMovement, sourceFileHash: 'abc123', sourceRowKey: 'row:43' }
  ]);

  assert.equal(result.accepted.length, 2);
  assert.equal(result.repeated.length, 0);
});

test('normaliza texto solo para encontrar candidatos comparables', () => {
  const first = buildTransactionCandidateFingerprint(baseMovement);
  const second = buildTransactionCandidateFingerprint({
    ...baseMovement,
    originalDescription: '  pac   água 8795k '
  });

  assert.equal(first, second);
});

test('genera el mismo hash para el mismo contenido de archivo', async () => {
  const first = await hashImportFile(new Blob(['cartola-anonimizada']));
  const second = await hashImportFile(new Blob(['cartola-anonimizada']));
  const other = await hashImportFile(new Blob(['otra-cartola']));

  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('distingue ocurrencias iguales dentro de una cartola y conserva su origen entre descargas', () => {
  const rows = [
    { ...baseMovement, sourceRowKey: 'row:20' },
    { ...baseMovement, sourceRowKey: 'row:21' }
  ];
  const firstImport = assignStatementOriginIdentities(rows, 'Scotiabank');
  const regeneratedImport = assignStatementOriginIdentities([
    { ...baseMovement, sourceRowKey: 'row:35' },
    { ...baseMovement, sourceRowKey: 'row:36' }
  ], 'Scotiabank');

  assert.match(firstImport[0].sourceOriginKey, /\|OCC\|1$/);
  assert.match(firstImport[1].sourceOriginKey, /\|OCC\|2$/);
  assert.equal(firstImport[0].sourceOriginKey, regeneratedImport[0].sourceOriginKey);
  assert.equal(firstImport[1].sourceOriginKey, regeneratedImport[1].sourceOriginKey);
});
