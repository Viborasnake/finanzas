import test from 'node:test';
import assert from 'node:assert/strict';
import { getShiftedCalendarMonth, getSuggestedDashboardPeriod } from '../src/utils/dashboardPeriod.ts';

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

test('avanza y retrocede un mes calendario completo', () => {
  const previous = getShiftedCalendarMonth(new Date(2026, 6, 15), -1);
  const next = getShiftedCalendarMonth(new Date(2026, 6, 15), 1);

  assert.equal(previous.start.toISOString().slice(0, 10), '2026-06-01');
  assert.equal(previous.end.getDate(), 30);
  assert.equal(next.start.toISOString().slice(0, 10), '2026-08-01');
  assert.equal(next.end.getDate(), 31);
});
