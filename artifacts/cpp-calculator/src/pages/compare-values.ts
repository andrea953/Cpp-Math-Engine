export function toTodaysDollars(
  value: number,
  targetYear: number,
  todayYear: number,
  indexingRate: number,
): number {
  const inflationYears = Math.max(0, targetYear - todayYear - 1);
  return value / Math.pow(1 + indexingRate, inflationYears);
}
