import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_FORMAT_LABEL, isSupportedImportFile } from '../src/utils/importFileTypes.ts';

test('acepta todos los formatos de cartola que se muestran en la interfaz', () => {
  for (const fileName of ['cartola.csv', 'cartola.txt', 'cartola.dat', 'cartola.xls', 'cartola.xlsx', 'cartola.pdf']) {
    assert.equal(isSupportedImportFile({ name: fileName }), true, fileName);
  }
  assert.match(IMPORT_FORMAT_LABEL, /TXT/);
});

test('rechaza archivos que no son cartolas admitidas', () => {
  assert.equal(isSupportedImportFile({ name: 'captura.png' }), false);
  assert.equal(isSupportedImportFile({ name: 'cartola.pdf.exe' }), false);
});
