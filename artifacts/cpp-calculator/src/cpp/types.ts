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
  earningsHistory: EarningsRecord[];
  dropoutPeriods?: DropoutPeriod[];
  assumptions: Assumptions;
  postRetirementBenefit?: PostRetirementBenefit;
  /** Ages at which to compute starting CPP. Fractional values supported (e.g. 65.5). */
  startAges: number[];
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
  /** Months dropped under CRDO */
  crdoMonthsDropped: number;
  /** Months dropped under disability dropout */
  disabilityMonthsDropped: number;
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
}

export interface CalculationResult {
  /** Result for each requested start age */
  byStartAge: StartAgeResult[];
  /** Effective earnings history used (history + projected future earnings) */
  effectiveEarnings: EarningsRecord[];
  /** Warnings about input data (gaps, negative earnings, etc.) */
  warnings: string[];
}
