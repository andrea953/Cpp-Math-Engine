/**
 * CPP contribution amount calculator.
 *
 * Returns the dollar amount of CPP contributions a person pays for a given
 * year of pensionable earnings, broken out by base / Tier 1 / Tier 2 and
 * doubled when the person is self-employed (because they cover both the
 * employee and employer share).
 *
 * NB: Contributions are **separate** from CPP benefits — your monthly CPP
 * pension is calculated identically whether you were employed or self-
 * employed. This module only exists to surface the cost-side picture in the
 * UI so users see a real change when they toggle "self-employed" on.
 */
import {
  BASE_EMPLOYEE_CONTRIBUTION_RATE,
  TIER2_EMPLOYEE_CONTRIBUTION_RATE,
  TIER2_START_YEAR,
  YBE,
  getTier1ContributionRate,
  getYampe,
  getYmpe,
} from "./constants";

export interface ContributionBreakdown {
  /** Calendar year the contribution applies to */
  year: number;
  /** Whether the user is self-employed (multiplier = 2) or employed (multiplier = 1) */
  isSelfEmployed: boolean;
  /** YMPE for the year (above-YBE earnings up to here are subject to base + Tier 1) */
  ympe: number;
  /** YAMPE for the year (earnings between YMPE and YAMPE are subject to Tier 2) */
  yampe: number;
  /** Pensionable earnings used (capped at YAMPE) */
  pensionableEarnings: number;
  /** Earnings band subject to base + Tier 1 contributions ([YBE, min(earnings, YMPE)]) */
  baseBandEarnings: number;
  /** Earnings band subject to Tier 2 contributions ((YMPE, min(earnings, YAMPE)]) */
  tier2BandEarnings: number;
  /** Annual base CPP contribution (after multiplier) */
  baseContribution: number;
  /** Annual Tier 1 enhancement contribution (after multiplier) */
  tier1Contribution: number;
  /** Annual Tier 2 enhancement contribution (after multiplier) */
  tier2Contribution: number;
  /** Total annual CPP contribution */
  totalContribution: number;
  /** Per-paycheque equivalent if paid biweekly (totalContribution / 26) */
  biweeklyContribution: number;
  /**
   * What the same earner would pay if they were the opposite of their current
   * status (employed → SE doubles, SE → employed halves). Useful for showing
   * the delta in the UI.
   */
  totalContributionAtOppositeStatus: number;
}

/**
 * Compute the annual CPP contribution amount for a single year.
 *
 * @param year - Calendar year of the earnings (used to look up YMPE/YAMPE/Tier rates)
 * @param pensionableEarnings - Pensionable earnings reported for the year (will be capped at YAMPE)
 * @param isSelfEmployed - When true, applies a 2× multiplier (employee + employer share)
 * @param ympeGrowthRate - Rate for projecting YMPE past the published table (default 3.1%)
 * @param yampeGrowthRate - Rate for projecting YAMPE past the published table (defaults to ympeGrowthRate)
 */
export function calculateAnnualContribution(
  year: number,
  pensionableEarnings: number,
  isSelfEmployed: boolean,
  ympeGrowthRate = 0.031,
  yampeGrowthRate: number = ympeGrowthRate,
): ContributionBreakdown {
  const ympe = getYmpe(year, ympeGrowthRate);
  const yampe = getYampe(year, yampeGrowthRate);
  const cappedEarnings = Math.max(0, Math.min(pensionableEarnings, yampe));

  // Base + Tier 1 band: above YBE, up to YMPE
  const baseBandEarnings = Math.max(0, Math.min(cappedEarnings, ympe) - YBE);

  // Tier 2 band: above YMPE, up to YAMPE (only meaningful from 2024)
  const tier2BandEarnings =
    year >= TIER2_START_YEAR ? Math.max(0, cappedEarnings - ympe) : 0;

  const multiplier = isSelfEmployed ? 2 : 1;

  const baseContribution = baseBandEarnings * BASE_EMPLOYEE_CONTRIBUTION_RATE * multiplier;
  const tier1Contribution =
    baseBandEarnings * getTier1ContributionRate(year) * multiplier;
  const tier2Contribution = tier2BandEarnings * TIER2_EMPLOYEE_CONTRIBUTION_RATE * multiplier;
  const totalContribution = baseContribution + tier1Contribution + tier2Contribution;

  // What it would be at the opposite status
  const oppositeMultiplier = isSelfEmployed ? 1 : 2;
  const ratio = oppositeMultiplier / multiplier;
  const totalContributionAtOppositeStatus = totalContribution * ratio;

  return {
    year,
    isSelfEmployed,
    ympe,
    yampe,
    pensionableEarnings: cappedEarnings,
    baseBandEarnings,
    tier2BandEarnings,
    baseContribution,
    tier1Contribution,
    tier2Contribution,
    totalContribution,
    biweeklyContribution: totalContribution / 26,
    totalContributionAtOppositeStatus,
  };
}
