/**
 * Domain types for the CPP calculator.
 *
 * These mirror the OpenAPI schemas (ScenarioInputs, EarningsRecord, etc.) but are
 * defined here so the calculation engine has no dependency on the API client.
 */

export interface EarningsRecord {
  year: number;
  /** Total pensionable earnings reported to CPP for the year (will be capped at YMPE / YAMPE) */
  pensionableEarnings: number;
}

export type DropoutKind = "crdo" | "disability";

export interface DropoutPeriod {
  kind: DropoutKind;
  startYear: number;
  startMonth: number; // 1..12
  endYear: number;
  endMonth: number; // 1..12
  notes?: string;
}

export interface Assumptions {
  /** Annual growth rate of YMPE before benefits start (e.g. 0.031 = 3.1%) */
  ympeGrowthRate: number;
  /** Annual growth rate of YAMPE */
  yampeGrowthRate: number;
  /** Annual indexing rate applied to CPP after benefits start */
  indexingRate: number;
  /** Annual growth rate to project future pensionable earnings */
  futureEarningsGrowthRate: number;
  /** Assumed pensionable earnings for the next future year */
  assumedFutureEarnings: number;
  /** Age at which the person stops contributing to CPP */
  stopWorkAge: number;
}

export interface PostRetirementBenefit {
  continuesWorkingAfterStart: boolean;
  annualEarningsAfterStart?: number;
  stopAge?: number;
}

export interface ScenarioInputs {
  birthYear: number;
  birthMonth: number; // 1..12
  sex?: "unspecified" | "female" | "male";
  province?: string;
  /**
   * When true, the contributor pays both the employee and employer share of
   * CPP contributions (calculated benefits are unchanged — this only doubles
   * the displayed annual contribution amount).
   */
  isSelfEmployed?: boolean;
  earningsHistory: EarningsRecord[];
  dropoutPeriods?: DropoutPeriod[];
  assumptions: Assumptions;
  postRetirementBenefit?: PostRetirementBenefit;
  /** Ages at which to compute starting CPP. Fractional values supported (e.g. 65.5). */
  startAges: number[];
  /**
   * Optional survivor benefit scenario (treats the contributor as deceased and
   * computes the surviving spouse's benefit). See `survivor.ts`.
   */
  survivor?: import("./survivor").SurvivorInputs;
}

/**
 * Result of computing CPP for a single start age.
 */
export interface StartAgeResult {
  /** Age at which CPP starts (e.g. 60, 65, 70) */
  startAge: number;
  /** Calendar year that CPP starts */
  startYear: number;
  /** Calendar month that CPP starts */
  startMonth: number;

  /** Adjustment factor (e.g. 0.64 at 60, 1.00 at 65, 1.42 at 70) */
  adjustmentFactor: number;

  /** Base CPP monthly amount in start-year dollars */
  baseMonthly: number;
  /** Tier 1 enhancement monthly amount in start-year dollars */
  tier1Monthly: number;
  /** Tier 2 enhancement monthly amount in start-year dollars */
  tier2Monthly: number;
  /** Total monthly CPP at start (base + tier 1 + tier 2) in start-year dollars */
  totalMonthly: number;
  /** Total annual CPP at start in start-year dollars */
  totalAnnual: number;

  /**
   * Maximum monthly CPP retirement pension a person taking up at this age in
   * this start year could receive — i.e. the projected max-at-65 for the start
   * year (wage-indexed forward via `ympeGrowthRate`) multiplied by the standard
   * actuarial adjustment for this start age. In start-year dollars, so it can
   * be compared apples-to-apples with `totalMonthly`.
   */
  maxMonthlyAtStart: number;
  /**
   * `totalMonthly / maxMonthlyAtStart` — the user's projected monthly benefit
   * expressed as a fraction of the maximum possible benefit for someone taking
   * up at the same age in the same year. Values can exceed 1.0 in edge cases
   * (e.g. very high earners with a heavy enhancement contribution history),
   * but are typically in the 0.0–1.0 range. This ratio is invariant across
   * start ages because both numerator and denominator scale by the same
   * actuarial adjustment factor — it measures the strength of the user's
   * earnings record, independent of the timing decision.
   */
  percentOfMaximum: number;
  /**
   * Maximum monthly CPP retirement pension at age 65 in the user's start year
   * (no actuarial adjustment applied). Wage-indexed forward via
   * `ympeGrowthRate`. Used as the absolute reference point for
   * `percentOfAge65Maximum`.
   */
  maxMonthlyAtAge65: number;
  /**
   * `totalMonthly / maxMonthlyAtAge65` — the user's projected monthly benefit
   * expressed as a fraction of the *age-65* max in their start year. Unlike
   * `percentOfMaximum`, this DOES change with start age (because the numerator
   * scales by the actuarial factor while the denominator does not). At age 60
   * a max-earner shows ~64%; at age 70, ~142%. Useful for visualising the
   * timing decision.
   */
  percentOfAge65Maximum: number;

  /** Diagnostics for the base calculation */
  base: BaseCalcDiagnostics;
  /** Diagnostics for the enhancement calculation */
  enhancement: EnhancementCalcDiagnostics;

  /** Lifetime cumulative benefit in nominal dollars (indexed) for breakeven analysis */
  cumulativeByAge: { age: number; cumulativeNominal: number; annualNominal: number }[];
}

export interface BaseCalcDiagnostics {
  /** Months in contributory period (after CRDO/disability dropouts but before general 17% dropout) */
  contributoryPeriodMonths: number;
  /** Months dropped under CRDO (beneficial-only: only below-average months in the window) */
  crdoMonthsDropped: number;
  /** Months dropped under disability dropout */
  disabilityMonthsDropped: number;
  /**
   * Months dropped by the post-65 / late-take-up drop-out (a.k.a. the "age 65
   * drop-out"). Applies only when start age > 65: months from age 65 to take-up
   * are removed from the contributory period if their indexed earnings are
   * below the running mean (i.e. dropping them raises AMPE).
   */
  post65DropoutMonths: number;
  /** Months dropped by the general 17% drop-out */
  generalDropoutMonths: number;
  /** Months retained for the AMPE calculation */
  monthsRetained: number;
  /** Average Monthly Pensionable Earnings (post-cap) */
  ampe: number;
  /** AYMPE in start year (used to cap AMPE) */
  aympeStartYear: number;
  /** Adjustment factor applied for early/late take-up */
  adjustmentFactor: number;
}

export interface EnhancementCalcDiagnostics {
  /** Number of post-2018 years contributed */
  tier1ContributionYears: number;
  /** Pro-rata accrual factor (0..1) for Tier 1 */
  tier1AccrualFactor: number;
  /** Number of post-2023 years contributed */
  tier2ContributionYears: number;
  /** Pro-rata accrual factor (0..1) for Tier 2 */
  tier2AccrualFactor: number;
  /** Sum of indexed Tier 1 contributory earnings (capped at YMPE-YBE) */
  tier1IndexedEarningsSum: number;
  /** Sum of indexed Tier 2 contributory earnings (between YMPE and YAMPE) */
  tier2IndexedEarningsSum: number;
  /** Years where a drop-in (child-rearing or disability imputed income) replaced real income in Tier 1 */
  tier1DropInYears: number;
  /** Years where a drop-in (child-rearing or disability imputed income) replaced real income in Tier 2 */
  tier2DropInYears: number;
  /**
   * Imputed (drop-in) earnings per protected year, for the breakdown view.
   * One entry per calendar year covered by a CRDO/disability window that has
   * a positive imputed amount, whether or not the imputed value ended up
   * exceeding real earnings for that year. Sorted ascending by year.
   */
  dropInAmountsByYear: { year: number; amount: number }[];
}

export interface CalculationResult {
  /** Result for each requested start age */
  byStartAge: StartAgeResult[];
  /** Effective earnings history used (history + projected future earnings) */
  effectiveEarnings: EarningsRecord[];
  /** Warnings about input data (gaps, negative earnings, etc.) */
  warnings: string[];
}
