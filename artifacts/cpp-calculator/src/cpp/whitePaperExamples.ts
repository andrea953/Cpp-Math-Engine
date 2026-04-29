/**
 * Worked numerical examples for the white paper.
 *
 * A representative client (born June 1965) is fed through the actual engine
 * (`calculateCpp` / `calculateSurvivor`). Concrete numbers are then exposed
 * for each formula block in `white-paper.tsx` so the examples stay in sync
 * with constants and engine logic.
 *
 * Representative client:
 *   - Born June 1965, retires at 65 in 2030.
 *   - 35 years of YMPE-max pensionable earnings (1996–2030); the years
 *     1983–1995 (ages 18–30) are zero-earning and exercise the 17% drop-out.
 *   - Default planner assumptions (3.1% YMPE growth, 2.1% indexing).
 */

import {
  EARLY_ADJUSTMENT_PER_MONTH,
  ENHANCEMENT_FULL_YEARS,
  GENERAL_DROPOUT_RATE,
  LATE_ADJUSTMENT_PER_MONTH,
  TIER1_FULL_REPLACEMENT_RATE,
  TIER1_PHASE_IN,
  TIER2_REPLACEMENT_RATE,
  YBE,
  getAyampe,
  getAympe,
  getMaxBenefitAt65,
  getYampe,
  getYmpe,
} from "./constants";
import { calculateCpp } from "./calculate";
import { calculateSurvivor, type SurvivorInputs } from "./survivor";
import { DEFAULT_ASSUMPTIONS } from "./defaults";
import type { DropoutPeriod, EarningsRecord, ScenarioInputs } from "./types";

const BIRTH_YEAR = 1965;
const BIRTH_MONTH = 6;
const START_AGE = 65;
const START_YEAR = BIRTH_YEAR + START_AGE; // 2030
const YEARS_OF_MAX_EARNINGS = 35;

const YMPE_GROWTH = DEFAULT_ASSUMPTIONS.ympeGrowthRate;
const YAMPE_GROWTH = DEFAULT_ASSUMPTIONS.yampeGrowthRate;

function buildExampleEarnings(): EarningsRecord[] {
  const list: EarningsRecord[] = [];
  const firstWorkYear = START_YEAR - YEARS_OF_MAX_EARNINGS + 1; // 1996
  for (let y = firstWorkYear; y <= START_YEAR; y++) {
    list.push({ year: y, pensionableEarnings: getYmpe(y, YMPE_GROWTH) });
  }
  return list;
}

const SCENARIO: ScenarioInputs = {
  birthYear: BIRTH_YEAR,
  birthMonth: BIRTH_MONTH,
  earningsHistory: buildExampleEarnings(),
  dropoutPeriods: [],
  assumptions: { ...DEFAULT_ASSUMPTIONS, stopWorkAge: START_AGE },
  postRetirementBenefit: { continuesWorkingAfterStart: false },
  startAges: [60, 65, 70],
};

const RESULT = calculateCpp(SCENARIO);
const r60 = RESULT.byStartAge.find((r) => r.startAge === 60)!;
const r65 = RESULT.byStartAge.find((r) => r.startAge === 65)!;
const r70 = RESULT.byStartAge.find((r) => r.startAge === 70)!;

// ---------------------------------------------------------------------------
// AYMPE: 5-year average YMPE ending in the start year
// ---------------------------------------------------------------------------
const AYMPE_YEARS = [START_YEAR - 4, START_YEAR - 3, START_YEAR - 2, START_YEAR - 1, START_YEAR].map(
  (y) => ({ year: y, ympe: getYmpe(y, YMPE_GROWTH) }),
);
const AYMPE_START = getAympe(START_YEAR, YMPE_GROWTH);
const AYAMPE_START = getAyampe(START_YEAR, YAMPE_GROWTH);

// ---------------------------------------------------------------------------
// AMPE indexing: walk a single representative year through the formula
// ---------------------------------------------------------------------------
const AMPE_IDX_YEAR = 2010;
const AMPE_IDX_YMPE = getYmpe(AMPE_IDX_YEAR, YMPE_GROWTH);
const AMPE_IDX_CAPPED_MONTHLY = AMPE_IDX_YMPE / 12;
const AMPE_IDX_INDEXED_MONTHLY = (AMPE_IDX_CAPPED_MONTHLY * AYMPE_START) / AMPE_IDX_YMPE;

// ---------------------------------------------------------------------------
// Drop-out impact: AMPE with vs without the 17% drop-out
//
// All non-zero months in the rep client earn at YMPE-max, which after indexing
// is exactly AYMPE/12 per month. The 1983–1995 zero-earning months are the
// lowest-indexed in the contributory period, so the engine drops them first;
// the dropped 95 months are therefore all $0. Without the drop-out, AMPE
// would average over every contributory month including the remaining zeros.
// ---------------------------------------------------------------------------
const CONTRIB_MONTHS = r65.base.contributoryPeriodMonths;
const MONTHS_RETAINED = r65.base.monthsRetained;
const SUM_INDEXED_KEPT = r65.base.ampe * MONTHS_RETAINED;
const AMPE_NO_DROPOUT = SUM_INDEXED_KEPT / CONTRIB_MONTHS;
const BASE_MONTHLY_NO_DROPOUT = AMPE_NO_DROPOUT * 0.25;
const BASE_MONTHLY_WITH_DROPOUT = r65.base.ampe * 0.25;

// ---------------------------------------------------------------------------
// Tier 1 worked example
// ---------------------------------------------------------------------------
// One phase-in year (2019, phase 0.15) and one full year (2023, phase 1.0)
const TIER1_EX_PHASE_YEAR = 2019;
const TIER1_EX_PHASE_YMPE = getYmpe(TIER1_EX_PHASE_YEAR, YMPE_GROWTH);
const TIER1_EX_PHASE_EARN = TIER1_EX_PHASE_YMPE - YBE;
const TIER1_EX_PHASE_INDEXED = (TIER1_EX_PHASE_EARN * AYMPE_START) / TIER1_EX_PHASE_YMPE;
const TIER1_EX_PHASE_FACTOR = TIER1_PHASE_IN[TIER1_EX_PHASE_YEAR] ?? 1;
const TIER1_EX_PHASE_WEIGHTED = TIER1_EX_PHASE_INDEXED * TIER1_EX_PHASE_FACTOR;

const TIER1_EX_FULL_YEAR = 2023;
const TIER1_EX_FULL_YMPE = getYmpe(TIER1_EX_FULL_YEAR, YMPE_GROWTH);
const TIER1_EX_FULL_EARN = TIER1_EX_FULL_YMPE - YBE;
const TIER1_EX_FULL_INDEXED = (TIER1_EX_FULL_EARN * AYMPE_START) / TIER1_EX_FULL_YMPE;
const TIER1_EX_FULL_FACTOR = TIER1_PHASE_IN[TIER1_EX_FULL_YEAR] ?? 1;
const TIER1_EX_FULL_WEIGHTED = TIER1_EX_FULL_INDEXED * TIER1_EX_FULL_FACTOR;

// ---------------------------------------------------------------------------
// Tier 2 worked example
//
// The rep client never earns above YMPE so its tier-2 result is $0. To
// illustrate the formula, we walk through a single year (2024) at the
// YAMPE-max so the band {YMPE..YAMPE} is fully exercised. The annual-at-65
// amount uses a 7-year contribution window (2024..START_YEAR-1) with one of
// those years priced symbolically at the YAMPE-max for the example.
// ---------------------------------------------------------------------------
const TIER2_EX_YEAR = 2024;
const TIER2_EX_YMPE = getYmpe(TIER2_EX_YEAR, YMPE_GROWTH);
const TIER2_EX_YAMPE = getYampe(TIER2_EX_YEAR, YAMPE_GROWTH);
const TIER2_EX_EARN = TIER2_EX_YAMPE - TIER2_EX_YMPE;
const TIER2_EX_INDEXED = (TIER2_EX_EARN * AYAMPE_START) / TIER2_EX_YAMPE;

// Hypothetical "max YAMPE since 2024" client to show a real Tier 2 dollar
// amount alongside the formula. Same birth/start as rep client, but earnings
// are at YAMPE-max from 2024 onward (and YMPE-max before that).
function buildTier2ExampleEarnings(): EarningsRecord[] {
  const list: EarningsRecord[] = [];
  const firstWorkYear = START_YEAR - YEARS_OF_MAX_EARNINGS + 1;
  for (let y = firstWorkYear; y <= START_YEAR; y++) {
    if (y >= 2024) {
      list.push({ year: y, pensionableEarnings: getYampe(y, YAMPE_GROWTH) });
    } else {
      list.push({ year: y, pensionableEarnings: getYmpe(y, YMPE_GROWTH) });
    }
  }
  return list;
}
const TIER2_SCENARIO: ScenarioInputs = {
  ...SCENARIO,
  earningsHistory: buildTier2ExampleEarnings(),
};
const TIER2_RESULT = calculateCpp(TIER2_SCENARIO).byStartAge.find((r) => r.startAge === 65)!;

// ---------------------------------------------------------------------------
// Adjustment factor at age 60 / 65 / 70
// ---------------------------------------------------------------------------
const ADJ_60 = 1 - EARLY_ADJUSTMENT_PER_MONTH * 60;
const ADJ_65 = 1;
const ADJ_70 = 1 + LATE_ADJUSTMENT_PER_MONTH * 60;

// ---------------------------------------------------------------------------
// Post-Retirement Benefit (PRB) example
//
// Same client starts CPP at 65 but continues working until 70 at $80,000/year.
// The engine accrues PRB each year inside `projectCumulative`. Re-run the
// scenario with the PRB option enabled and read the cumulative-by-age stream
// to extract the annualized PRB delta vs. the no-PRB baseline.
// ---------------------------------------------------------------------------
const PRB_ANNUAL_EARNINGS = 80_000;
const PRB_STOP_AGE = 70;
const PRB_SCENARIO: ScenarioInputs = {
  ...SCENARIO,
  postRetirementBenefit: {
    continuesWorkingAfterStart: true,
    annualEarningsAfterStart: PRB_ANNUAL_EARNINGS,
    stopAge: PRB_STOP_AGE,
  },
};
const PRB_RESULT = calculateCpp(PRB_SCENARIO).byStartAge.find((r) => r.startAge === 65)!;
const PRB_AT_70 = PRB_RESULT.cumulativeByAge.find((p) => p.age === 70)!;
const NOPRB_AT_70 = r65.cumulativeByAge.find((p) => p.age === 70)!;
const PRB_ANNUAL_AT_70 = PRB_AT_70.annualNominal - NOPRB_AT_70.annualNominal;
// First-year PRB accrual: ratio × startMonthly × 12 / 40
const PRB_YMPE_START = getYmpe(START_YEAR, YMPE_GROWTH);
const PRB_RATIO = Math.min(1, PRB_ANNUAL_EARNINGS / PRB_YMPE_START);
const PRB_FIRST_YEAR_ANNUAL = ((r65.totalMonthly * 12) / 40) * PRB_RATIO;
const PRB_FIRST_YEAR_MONTHLY = PRB_FIRST_YEAR_ANNUAL / 12;

// ---------------------------------------------------------------------------
// CRDO drop-out worked example
//
// A representative parent (same June 1965 birth, retiring at 65 in 2030):
//   - Started YMPE-max work in 1988 (age 23) after schooling.
//   - Took a 6-year break (Jan 2000 – Dec 2005, ages 35–40) raising young
//     children — zero pensionable earnings during that window.
//   - Returned to YMPE-max work 2006 → 2030.
//
// Run the engine twice — once with no dropout periods, once with a CRDO
// claim covering the parental window — and read AMPE / base CPP off both
// results so the dollar uplift stays correct as constants change.
// ---------------------------------------------------------------------------
const CRDO_WORK_START_YEAR = 1988;
const CRDO_GAP_START_YEAR = 2000;
const CRDO_GAP_END_YEAR = 2005;
const CRDO_GAP_YEARS = CRDO_GAP_END_YEAR - CRDO_GAP_START_YEAR + 1;

function buildParentEarnings(gapStartYear: number, gapEndYear: number): EarningsRecord[] {
  const list: EarningsRecord[] = [];
  for (let y = CRDO_WORK_START_YEAR; y <= START_YEAR; y++) {
    if (y >= gapStartYear && y <= gapEndYear) {
      list.push({ year: y, pensionableEarnings: 0 });
    } else {
      list.push({ year: y, pensionableEarnings: getYmpe(y, YMPE_GROWTH) });
    }
  }
  return list;
}

const PARENT_SCENARIO_BASE: ScenarioInputs = {
  birthYear: BIRTH_YEAR,
  birthMonth: BIRTH_MONTH,
  earningsHistory: buildParentEarnings(CRDO_GAP_START_YEAR, CRDO_GAP_END_YEAR),
  dropoutPeriods: [],
  assumptions: { ...DEFAULT_ASSUMPTIONS, stopWorkAge: START_AGE },
  postRetirementBenefit: { continuesWorkingAfterStart: false },
  startAges: [START_AGE],
};

const CRDO_PERIODS: DropoutPeriod[] = [
  {
    kind: "crdo",
    startYear: CRDO_GAP_START_YEAR,
    startMonth: 1,
    endYear: CRDO_GAP_END_YEAR,
    endMonth: 12,
  },
];

const CRDO_NO_CLAIM = calculateCpp(PARENT_SCENARIO_BASE).byStartAge[0]!;
const CRDO_WITH_CLAIM = calculateCpp({
  ...PARENT_SCENARIO_BASE,
  dropoutPeriods: CRDO_PERIODS,
}).byStartAge[0]!;

// ---------------------------------------------------------------------------
// Disability drop-out worked example
//
// Same birth (June 1965) and start age (65 in 2030). Started YMPE-max work in
// 1988 (age 23). Then a 5-year disability window (Jan 2010 – Dec 2014, ages
// 44–49) with zero pensionable earnings. Returned to YMPE-max work 2015 →
// 2030. Same with-vs-without comparison as above.
// ---------------------------------------------------------------------------
const DIS_GAP_START_YEAR = 2010;
const DIS_GAP_END_YEAR = 2014;
const DIS_GAP_YEARS = DIS_GAP_END_YEAR - DIS_GAP_START_YEAR + 1;

const DISABILITY_SCENARIO_BASE: ScenarioInputs = {
  ...PARENT_SCENARIO_BASE,
  earningsHistory: buildParentEarnings(DIS_GAP_START_YEAR, DIS_GAP_END_YEAR),
};

const DISABILITY_PERIODS: DropoutPeriod[] = [
  {
    kind: "disability",
    startYear: DIS_GAP_START_YEAR,
    startMonth: 1,
    endYear: DIS_GAP_END_YEAR,
    endMonth: 12,
  },
];

const DIS_NO_CLAIM = calculateCpp(DISABILITY_SCENARIO_BASE).byStartAge[0]!;
const DIS_WITH_CLAIM = calculateCpp({
  ...DISABILITY_SCENARIO_BASE,
  dropoutPeriods: DISABILITY_PERIODS,
}).byStartAge[0]!;

// ---------------------------------------------------------------------------
// Survivor combined-benefit cap example
//
// Same client dies in 2030 at 65; surviving spouse is also 65 and is already
// drawing their own max retirement pension. The own retirement consumes most
// of the cap and the survivor pension's base+Tier 1 portion is largely
// clawed back.
// ---------------------------------------------------------------------------
const SURVIVOR_INPUTS: SurvivorInputs = {
  enabled: true,
  startYear: START_YEAR,
  survivorAge: 65,
  hasDependentChildren: false,
  survivorDisabled: false,
  numEligibleChildren: 0,
  survivorOwnBaseTier1Monthly: r65.baseMonthly + r65.tier1Monthly,
  survivorOwnTier2Monthly: r65.tier2Monthly,
};
const SURVIVOR_RESULT = calculateSurvivor(SCENARIO, SURVIVOR_INPUTS);

export const whitePaperExamples = {
  /** Profile of the example client used throughout the white paper. */
  profile: {
    birthYear: BIRTH_YEAR,
    birthMonth: BIRTH_MONTH,
    startAge: START_AGE,
    startYear: START_YEAR,
    yearsOfMaxEarnings: YEARS_OF_MAX_EARNINGS,
    firstWorkYear: START_YEAR - YEARS_OF_MAX_EARNINGS + 1,
    label: `1965-born client, retiring at 65 (${START_YEAR}), ${YEARS_OF_MAX_EARNINGS} years of YMPE-max earnings`,
  },

  ympeStart: getYmpe(START_YEAR, YMPE_GROWTH),
  yampeStart: getYampe(START_YEAR, YAMPE_GROWTH),
  aympeYears: AYMPE_YEARS,
  aympeStart: AYMPE_START,
  ayampeStart: AYAMPE_START,

  ampeIndex: {
    year: AMPE_IDX_YEAR,
    ympe: AMPE_IDX_YMPE,
    cappedMonthly: AMPE_IDX_CAPPED_MONTHLY,
    indexedMonthly: AMPE_IDX_INDEXED_MONTHLY,
  },

  ampe: r65.base.ampe,
  ampeCap: r65.base.aympeStartYear / 12,
  ampeNoDropout: AMPE_NO_DROPOUT,

  base: {
    ampe: r65.base.ampe,
    monthlyAt65: r65.baseMonthly,
    contribMonths: CONTRIB_MONTHS,
    monthsRetained: MONTHS_RETAINED,
    generalDropoutMonths: r65.base.generalDropoutMonths,
    monthlyWithDropout: BASE_MONTHLY_WITH_DROPOUT,
    monthlyNoDropout: BASE_MONTHLY_NO_DROPOUT,
    dropoutLift: BASE_MONTHLY_WITH_DROPOUT - BASE_MONTHLY_NO_DROPOUT,
    dropoutRate: GENERAL_DROPOUT_RATE,
  },

  tier1: {
    fullRate: TIER1_FULL_REPLACEMENT_RATE,
    enhancementFullYears: ENHANCEMENT_FULL_YEARS,
    contributionYears: r65.enhancement.tier1ContributionYears,
    accrualFactor: r65.enhancement.tier1AccrualFactor,
    monthlyAt65: r65.tier1Monthly,
    phaseExample: {
      year: TIER1_EX_PHASE_YEAR,
      ympe: TIER1_EX_PHASE_YMPE,
      tier1Earn: TIER1_EX_PHASE_EARN,
      indexed: TIER1_EX_PHASE_INDEXED,
      phaseFactor: TIER1_EX_PHASE_FACTOR,
      weighted: TIER1_EX_PHASE_WEIGHTED,
    },
    fullExample: {
      year: TIER1_EX_FULL_YEAR,
      ympe: TIER1_EX_FULL_YMPE,
      tier1Earn: TIER1_EX_FULL_EARN,
      indexed: TIER1_EX_FULL_INDEXED,
      phaseFactor: TIER1_EX_FULL_FACTOR,
      weighted: TIER1_EX_FULL_WEIGHTED,
    },
  },

  tier2: {
    rate: TIER2_REPLACEMENT_RATE,
    yearExample: {
      year: TIER2_EX_YEAR,
      ympe: TIER2_EX_YMPE,
      yampe: TIER2_EX_YAMPE,
      tier2Earn: TIER2_EX_EARN,
      indexed: TIER2_EX_INDEXED,
    },
    /** Result for the alternate "YAMPE-max from 2024 onward" scenario. */
    altScenarioMonthlyAt65: TIER2_RESULT.tier2Monthly,
    altScenarioContributionYears: TIER2_RESULT.enhancement.tier2ContributionYears,
    altScenarioAccrualFactor: TIER2_RESULT.enhancement.tier2AccrualFactor,
  },

  adjustment: {
    earlyPerMonth: EARLY_ADJUSTMENT_PER_MONTH,
    latePerMonth: LATE_ADJUSTMENT_PER_MONTH,
    factor60: ADJ_60,
    factor65: ADJ_65,
    factor70: ADJ_70,
    total60: r60.totalMonthly,
    total65: r65.totalMonthly,
    total70: r70.totalMonthly,
  },

  /**
   * Worked numbers for the "% of maximum" white-paper section. Each take-up
   * age has its own start year (60 → START_YEAR-5, 65 → START_YEAR, 70 →
   * START_YEAR+5), so each has its own projected max-at-65 base. The engine
   * (`calculate.ts`) projects `getMaxBenefitAt65(start.year, ympeGrowthRate)`
   * for each start age individually, then multiplies by that age's
   * actuarial adjustment factor — these example fields mirror that pathway
   * exactly so the printed derivation matches the engine output.
   */
  maximum: {
    /** YMPE (wage) growth rate used to project max-at-65 forward to each start year. */
    ympeGrowthRate: YMPE_GROWTH,
    /** Start year of each take-up age for the example client. */
    startYear60: r60.startYear,
    startYear65: r65.startYear,
    startYear70: r70.startYear,
    /** Projected max-at-65 in each take-up age's own start year, in that year's dollars. */
    maxAt65InStartYear60: getMaxBenefitAt65(r60.startYear, YMPE_GROWTH),
    maxAt65InStartYear65: getMaxBenefitAt65(r65.startYear, YMPE_GROWTH),
    maxAt65InStartYear70: getMaxBenefitAt65(r70.startYear, YMPE_GROWTH),
    /** Max benefit at each take-up age (projected max-at-65 × that age's adjustment factor). */
    maxAt60: r60.maxMonthlyAtStart,
    maxAt65: r65.maxMonthlyAtStart,
    maxAt70: r70.maxMonthlyAtStart,
    /** Total monthly ÷ max at start age — exactly what the result cards display. */
    pctOf60: r60.percentOfMaximum,
    pctOf65: r65.percentOfMaximum,
    pctOf70: r70.percentOfMaximum,
  },

  total: {
    base: r65.baseMonthly,
    tier1: r65.tier1Monthly,
    tier2: r65.tier2Monthly,
    monthly: r65.totalMonthly,
  },

  prb: {
    annualEarnings: PRB_ANNUAL_EARNINGS,
    stopAge: PRB_STOP_AGE,
    ympeAtStart: PRB_YMPE_START,
    ratio: PRB_RATIO,
    startMonthly: r65.totalMonthly,
    firstYearAnnual: PRB_FIRST_YEAR_ANNUAL,
    firstYearMonthly: PRB_FIRST_YEAR_MONTHLY,
    annualUpliftAt70: PRB_ANNUAL_AT_70,
    fullEnhancementYears: ENHANCEMENT_FULL_YEARS,
  },

  crdoExample: {
    workStartYear: CRDO_WORK_START_YEAR,
    gapStartYear: CRDO_GAP_START_YEAR,
    gapEndYear: CRDO_GAP_END_YEAR,
    yearsOff: CRDO_GAP_YEARS,
    monthsOff: CRDO_GAP_YEARS * 12,
    contribMonths: CRDO_NO_CLAIM.base.contributoryPeriodMonths,
    monthsRetainedWithout: CRDO_NO_CLAIM.base.monthsRetained,
    generalDropoutMonthsWithout: CRDO_NO_CLAIM.base.generalDropoutMonths,
    monthsRetainedWith: CRDO_WITH_CLAIM.base.monthsRetained,
    generalDropoutMonthsWith: CRDO_WITH_CLAIM.base.generalDropoutMonths,
    crdoMonthsDropped: CRDO_WITH_CLAIM.base.crdoMonthsDropped,
    ampeWithout: CRDO_NO_CLAIM.base.ampe,
    ampeWith: CRDO_WITH_CLAIM.base.ampe,
    baseMonthlyWithout: CRDO_NO_CLAIM.baseMonthly,
    baseMonthlyWith: CRDO_WITH_CLAIM.baseMonthly,
    totalMonthlyWithout: CRDO_NO_CLAIM.totalMonthly,
    totalMonthlyWith: CRDO_WITH_CLAIM.totalMonthly,
    baseLift: CRDO_WITH_CLAIM.baseMonthly - CRDO_NO_CLAIM.baseMonthly,
    totalLift: CRDO_WITH_CLAIM.totalMonthly - CRDO_NO_CLAIM.totalMonthly,
  },

  disabilityExample: {
    workStartYear: CRDO_WORK_START_YEAR,
    gapStartYear: DIS_GAP_START_YEAR,
    gapEndYear: DIS_GAP_END_YEAR,
    yearsOff: DIS_GAP_YEARS,
    monthsOff: DIS_GAP_YEARS * 12,
    contribMonths: DIS_NO_CLAIM.base.contributoryPeriodMonths,
    monthsRetainedWithout: DIS_NO_CLAIM.base.monthsRetained,
    generalDropoutMonthsWithout: DIS_NO_CLAIM.base.generalDropoutMonths,
    monthsRetainedWith: DIS_WITH_CLAIM.base.monthsRetained,
    generalDropoutMonthsWith: DIS_WITH_CLAIM.base.generalDropoutMonths,
    disabilityMonthsDropped: DIS_WITH_CLAIM.base.disabilityMonthsDropped,
    ampeWithout: DIS_NO_CLAIM.base.ampe,
    ampeWith: DIS_WITH_CLAIM.base.ampe,
    baseMonthlyWithout: DIS_NO_CLAIM.baseMonthly,
    baseMonthlyWith: DIS_WITH_CLAIM.baseMonthly,
    totalMonthlyWithout: DIS_NO_CLAIM.totalMonthly,
    totalMonthlyWith: DIS_WITH_CLAIM.totalMonthly,
    baseLift: DIS_WITH_CLAIM.baseMonthly - DIS_NO_CLAIM.baseMonthly,
    totalLift: DIS_WITH_CLAIM.totalMonthly - DIS_NO_CLAIM.totalMonthly,
  },

  survivor: {
    cap: SURVIVOR_RESULT.combinedBenefitCap,
    deceasedBaseTier1: SURVIVOR_RESULT.deceasedCalculatedRetirementBaseTier1,
    survivorOwnBaseTier1: SURVIVOR_INPUTS.survivorOwnBaseTier1Monthly,
    pensionUncapped: SURVIVOR_RESULT.survivorPensionBaseTier1,
    pensionAfterCap: SURVIVOR_RESULT.survivorPensionBaseTier1AfterCap,
    capReduction: SURVIVOR_RESULT.combinedCapReduction,
    pensionTier2: SURVIVOR_RESULT.survivorPensionTier2,
    survivorMonthlyTotal: SURVIVOR_RESULT.survivorMonthlyTotal,
  },
};
