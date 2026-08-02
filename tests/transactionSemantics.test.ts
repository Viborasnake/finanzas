import assert from 'node:assert/strict';
import test from 'node:test';
import { isCreditCardSettlement, isInvestmentMovement, isOwnTransferMovement } from '../src/utils/transactionSemantics.ts';

test('detecta la liquidación de un DAP aunque esté clasificada como ingreso', () => {
  assert.equal(isInvestmentMovement({
    description: 'ABONO LIQUIDACIÓN CAPTACIÓN 552769441642',
    tipo_movimiento: 'Ingreso',
    categoria_principal: 'Otros Ingresos'
  }), true);
});

test('considera colocación y rescate como inversión, no transferencia propia', () => {
  const placement = { description: 'PAGO CAPTACIÓN INICIAL 552885141642', tipo_movimiento: 'Ahorro/Inversión' };
  const redemption = { description: 'ABONO LIQUIDACIÓN CAPTACIÓN 552769441642', tipo_movimiento: 'Ahorro/Inversión' };

  assert.equal(isInvestmentMovement(placement), true);
  assert.equal(isInvestmentMovement(redemption), true);
  assert.equal(isOwnTransferMovement(placement), false);
  assert.equal(isOwnTransferMovement(redemption), false);
});

test('mantiene las transferencias propias separadas de las inversiones', () => {
  assert.equal(isOwnTransferMovement({
    tipo_movimiento: 'Ingreso',
    categoria_secundaria: 'Transferencias Propias'
  }), true);
});

test('detecta el pago de tarjeta como liquidación de deuda y no como consumo nuevo', () => {
  assert.equal(isCreditCardSettlement({
    description: 'PAGO POR SWEB DE CAT ADMINISTR',
    tipo_movimiento: 'Egreso',
    categoria_principal: 'Pago Tarjeta Crédito',
    categoria_secundaria: 'Tarjeta Credito'
  }), true);
});
