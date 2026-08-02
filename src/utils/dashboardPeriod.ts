interface SuggestedDashboardPeriodInput {
  periodWasChosen: boolean;
  activePreset: string;
  currentCount: number;
  previousCount: number;
  minimumCurrentCount: number;
}

export function getSuggestedDashboardPeriod({
  periodWasChosen,
  activePreset,
  currentCount,
  previousCount,
  minimumCurrentCount
}: SuggestedDashboardPeriodInput): 'month' | 'prev_month' | null {
  if (periodWasChosen) return null;
  if (currentCount >= minimumCurrentCount) return activePreset === 'month' ? null : 'month';
  if (previousCount > 0) return activePreset === 'prev_month' ? null : 'prev_month';
  return null;
}

export function getShiftedCalendarMonth(currentStart: Date, offset: number) {
  const start = new Date(currentStart.getFullYear(), currentStart.getMonth() + offset, 1, 0, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    start,
    end,
    label: start.toLocaleString('es-CL', { month: 'long', year: 'numeric' })
  };
}
