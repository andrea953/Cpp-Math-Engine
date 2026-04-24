import type { ScenarioInputs } from "./types";

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
  return {
    birthYear: today.getFullYear() - 55,
    birthMonth: 6,
    sex: "unspecified",
    province: "ON",
    earningsHistory: [],
    dropoutPeriods: [],
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    postRetirementBenefit: { continuesWorkingAfterStart: false },
    startAges: [60, 65, 70],
  };
}
