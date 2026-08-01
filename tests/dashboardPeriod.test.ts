import test from 'node:test';
import assert from 'node:assert/strict';
import { getSuggestedDashboardPeriod } from '../src/utils/dashboardPeriod.ts';

test('respeta cualquier periodo elegido explícitamente por la persona', () => {
  assert.equal(getSuggestedDashboardPeriod({
    periodWasChosen: true,
    activePreset: 'prev_month',
    currentCount: 20,
    previousCount: 10,
    minimumCurrentCount: 8
  }), null);
});

test('elige el mes actual solo durante la selección inicial', () => {
  assert.equal(getSuggestedDashboardPeriod({
    periodWasChosen: false,
    activePreset: 'prev_month',
    currentCount: 8,
    previousCount: 10,
    minimumCurrentCount: 8
  }), 'month');
});

test('usa el mes anterior cuando el actual todavía no tiene información suficiente', () => {
  assert.equal(getSuggestedDashboardPeriod({
    periodWasChosen: false,
    activePreset: 'month',
    currentCount: 2,
    previousCount: 10,
    minimumCurrentCount: 8
  }), 'prev_month');
});
