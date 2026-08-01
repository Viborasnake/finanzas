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
