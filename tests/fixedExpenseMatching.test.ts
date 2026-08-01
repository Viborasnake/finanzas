import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAccountCandidate, evaluateAccountMatch } from '../src/utils/fixedExpenseMatching.ts';

const waterAccount = {
  name: 'Agua',
  tipo_movimiento: 'Egreso',
  categoria_principal: 'Cuentas Básicas',
  categoria_secundaria: 'Agua',
  keyword: 'PAC AGUA'
};

test('vincula un pago por tipo, categoría y subcategoría normalizadas', () => {
  const result = evaluateAccountMatch({
    type: 'egreso',
    tipo_movimiento: 'Gasto Real',
    categoria_principal: 'cuentas basicas',
    categoria_secundaria: 'AGUA'
  }, waterAccount);

  assert.equal(result.matches, true);
});

test('no vincula una subcategoría distinta aunque comparta la categoría principal', () => {
  const result = evaluateAccountMatch({
    type: 'egreso',
    tipo_movimiento: 'Egreso',
    categoria_principal: 'Cuentas Básicas',
    categoria_secundaria: 'Gas'
  }, waterAccount);

  assert.equal(result.matches, false);
});

test('una cuenta configurada solo a nivel principal acepta sus subcategorías', () => {
  const result = evaluateAccountMatch({
    type: 'egreso',
    categoria_principal: 'Suscripciones',
    categoria_secundaria: 'Chat GPT'
  }, {
    tipo_movimiento: 'Egreso',
    categoria_principal: 'Suscripciones'
  });

  assert.equal(result.matches, true);
});

test('prioriza la palabra configurada al sugerir una corrección', () => {
  const transaction = {
    type: 'egreso',
    amount: -13956,
    description: 'PAC AGUA 8795K'
  };
  const result = evaluateAccountCandidate(transaction, waterAccount);

  assert.equal(result?.score, 100);
  assert.equal(result?.tx, transaction);
});

test('no propone movimientos de ingreso como pagos fijos', () => {
  const result = evaluateAccountCandidate({
    type: 'ingreso',
    amount: 13956,
    description: 'PAC AGUA 8795K'
  }, waterAccount);

  assert.equal(result, null);
});
