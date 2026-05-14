import type { EarningsRecord, ScenarioInputs } from "./types";
import { YAMPE_HISTORY, YMPE_HISTORY } from "./constants";
import { buildDefaultSurvivorInputs } from "./survivor";

/**
 * Build a year-by-year earnings history at the maximum pensionable earnings,
 * from the year the client turned 18 through the most recent calendar year
 * for which a YMPE value is published. Used to pre-populate the earnings
 * table for new scenarios so that planners start from a "max earner"
 * baseline they can edit down (or replace by uploading a Statement of
 * Contributions).
 *
 * Starting in 2024, CPP2 introduced the Year's Additional Maximum
 * Pensionable Earnings (YAMPE) — a second tier of pensionable earnings
 * above the YMPE. A true max earner contributes on the full YAMPE band
 * (Tier 1 up to YMPE, plus Tier 2 between YMPE and YAMPE), so for
 * 2024-onward we use YAMPE rather than YMPE as the baseline.
 */
export function buildYmpeMaxEarnings(birthYear: number): EarningsRecord[] {
  const startYear = birthYear + 18;
  const knownYears = Object.keys(YMPE_HISTORY)
    .map(Number)
    .sort((a, b) => a - b);
  if (knownYears.length === 0) return [];
  const lastKnown = knownYears[knownYears.length - 1];
  const endYear = Math.min(lastKnown, new Date().getFullYear() - 1);
  const out: EarningsRecord[] = [];
  for (let y = Math.max(startYear, knownYears[0]); y <= endYear; y++) {
    // For 2024+, the true max-earner baseline is YAMPE (the upper Tier 2
    // ceiling). Pre-2024, only YMPE existed.
    const cap = YAMPE_HISTORY[y] ?? YMPE_HISTORY[y];
    if (cap !== undefined) out.push({ year: y, pensionableEarnings: cap });
  }
  return out;
}

/** Default assumptions matching common Canadian planner conventions. */
export const DEFAULT_ASSUMPTIONS = {
  /** YMPE has historically grown at about the rate of average wage growth (~3.1%) */
  ympeGrowthRate: 0.031,
  /** YAMPE has been growing faster as the band ratchets up to 14% above YMPE */
  yampeGrowthRate: 0.031,
  /** Long-run CPI assumption used for indexing benefits in payment */
  indexingRate: 0.021,
  /** Future pensionable earnings growth — typically inflation + 1% */
  futureEarningsGrowthRate: 0.031,
  /** Default future earnings if the user doesn't specify */
  assumedFutureEarnings: 70000,
  /** Default to stop work at 65 */
  stopWorkAge: 65,
};

export function buildDefaultInputs(): ScenarioInputs {
  const today = new Date();
  const birthYear = today.getFullYear() - 55;
  return {
    birthYear,
    birthMonth: 6,
    sex: "unspecified",
    province: "ON",
    earningsHistory: buildYmpeMaxEarnings(birthYear),
    dropoutPeriods: [],
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    postRetirementBenefit: { continuesWorkingAfterStart: false },
    startAges: [60, 65, 70],
    survivor: buildDefaultSurvivorInputs(today.getFullYear()),
  };
}
