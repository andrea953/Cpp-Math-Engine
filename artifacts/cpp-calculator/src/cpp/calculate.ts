/**
 * CPP retirement benefit calculation engine.
 *
 * Models:
 *  - Base CPP (pre-2019 design): contributory period × 25% × adjustment factor
 *  - Tier 1 enhancement (2019–): adds replacement up to 33⅓% of YMPE
 *  - Tier 2 enhancement (2024–): adds replacement on YMPE→YAMPE band
 *  - General 17% drop-out
 *  - Child Rearing Drop-Out (CRDO)
 *  - Disability Drop-Out
 *  - Adjustment factors for take-up at 60..70
 *  - Post-Retirement Benefit (PRB) projection if working past start age
 *
 * NOT modeled (yet):
 *  - QPP integration (Quebec)
 *  - CPP Survivor / Disability / Children's benefits
 *  - Combined CPP + OAS optimization
 */

import {
  CPP_START_YEAR,
  EARLY_ADJUSTMENT_PER_MONTH,
  ENHANCEMENT_FULL_YEARS,
  GENERAL_DROPOUT_RATE,
  LATE_ADJUSTMENT_PER_MONTH,
  MAX_START_AGE,
  MIN_START_AGE,
  TIER1_FULL_REPLACEMENT_RATE,
  TIER1_PHASE_IN,
  TIER1_START_YEAR,
  TIER2_REPLACEMENT_RATE,
  TIER2_START_YEAR,
  YBE,
  getAyampe,
  getAympe,
  getYampe,
  getYmpe,
} from "./constants";
import type {
  Assumptions,
  BaseCalcDiagnostics,
  CalculationResult,
  DropoutPeriod,
  EarningsRecord,
  EnhancementCalcDiagnostics,
  PostRetirementBenefit,
  ScenarioInputs,
  StartAgeResult,
} from "./types";

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** Returns the (year, month) that a person turns the given age. */
function ageToYearMonth(birthYear: number, birthMonth: number, age: number): { year: number; month: number } {
  const wholeYears = Math.floor(age);
  const extraMonths = Math.round((age - wholeYears) * 12);
  let month = birthMonth + extraMonths;
  let year = birthYear + wholeYears;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return { year, month };
}

/** Number of whole months between (yA, mA) inclusive and (yB, mB) inclusive. Negative if B < A. */
function monthsBetweenInclusive(yA: number, mA: number, yB: number, mB: number): number {
  return (yB - yA) * 12 + (mB - mA) + 1;
}

/** Months in `year` that fall within [start, end] (inclusive on both ends). */
function monthsInYearWithin(year: number, startY: number, startM: number, endY: number, endM: number): number {
  if (year < startY || year > endY) return 0;
  const lo = year === startY ? startM : 1;
  const hi = year === endY ? endM : 12;
  return Math.max(0, hi - lo + 1);
}

// ---------------------------------------------------------------------------
// Earnings projection
// ---------------------------------------------------------------------------

/**
 * Given the user's earnings history plus assumptions about future earnings,
 * project earnings forward to the latest start age year (or stopWorkAge).
 * Earnings beyond stopWorkAge are zero.
 */
export function buildEffectiveEarnings(
  inputs: ScenarioInputs,
  endYear: number,
): EarningsRecord[] {
  const byYear = new Map<number, number>();
  for (const r of inputs.earningsHistory) {
    byYear.set(r.year, r.pensionableEarnings);
  }

  const stopYearMonth = ageToYearMonth(inputs.birthYear, inputs.birthMonth, inputs.assumptions.stopWorkAge);
  const stopYear = stopYearMonth.year;

  const histYears = inputs.earningsHistory.map((r) => r.year);
  const lastHistYear = histYears.length > 0 ? Math.max(...histYears) : inputs.birthYear + 17;

  // Project assumed earnings forward. Start from the earlier of (lastHistYear+1)
  // or the current calendar year so the assumption covers the current year even
  // when the user's earnings table doesn't extend that far. Years already in the
  // earnings history keep their entered value (we never overwrite history).
  const currentYear = new Date().getFullYear();
  const projectionStart = Math.min(lastHistYear + 1, currentYear);
  let projected = inputs.assumptions.assumedFutureEarnings;
  for (let y = projectionStart; y <= Math.min(endYear, stopYear); y++) {
    if (!byYear.has(y)) {
      byYear.set(y, projected);
    }
    projected = projected * (1 + inputs.assumptions.futureEarningsGrowthRate);
  }

  const result: EarningsRecord[] = [];
  const minYear = Math.min(...byYear.keys(), inputs.birthYear + 18);
  const maxYear = Math.max(...byYear.keys(), endYear);
  for (let y = minYear; y <= maxYear; y++) {
    result.push({ year: y, pensionableEarnings: byYear.get(y) ?? 0 });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Base CPP calculation (pre-2019 design, applies to everyone)
// ---------------------------------------------------------------------------

interface MonthlyEarningsPoint {
  year: number;
  month: number; // 1..12
  /** Pensionable earnings allocated to this month (annual / 12) */
  monthlyEarnings: number;
  /** Whether this month is droppable under CRDO */
  inCrdo: boolean;
  /** Whether this month is droppable under disability dropout */
  inDisability: boolean;
}

function buildMonthlyPoints(
  inputs: ScenarioInputs,
  effectiveEarnings: EarningsRecord[],
  contribStartY: number,
  contribStartM: number,
  contribEndY: number,
  contribEndM: number,
): MonthlyEarningsPoint[] {
  const earningsByYear = new Map<number, number>();
  for (const r of effectiveEarnings) earningsByYear.set(r.year, r.pensionableEarnings);

  const dropouts = inputs.dropoutPeriods ?? [];
  const points: MonthlyEarningsPoint[] = [];

  for (let y = contribStartY; y <= contribEndY; y++) {
    const annual = earningsByYear.get(y) ?? 0;
    const monthly = annual / 12;
    const monthLo = y === contribStartY ? contribStartM : 1;
    const monthHi = y === contribEndY ? contribEndM : 12;
    for (let m = monthLo; m <= monthHi; m++) {
      let inCrdo = false;
      let inDisability = false;
      for (const d of dropouts) {
        const inside =
          (y > d.startYear || (y === d.startYear && m >= d.startMonth)) &&
          (y < d.endYear || (y === d.endYear && m <= d.endMonth));
        if (inside) {
          if (d.kind === "crdo") inCrdo = true;
          if (d.kind === "disability") inDisability = true;
        }
      }
      points.push({ year: y, month: m, monthlyEarnings: monthly, inCrdo, inDisability });
    }
  }
  return points;
}

function calculateBase(
  inputs: ScenarioInputs,
  effectiveEarnings: EarningsRecord[],
  startYear: number,
  startMonth: number,
  startAge: number,
): { monthly: number; diag: BaseCalcDiagnostics; adjustmentFactor: number } {
  // Contributory period: from later of (age 18, Jan 1966) to earlier of (start month, age 70)
  const age18 = ageToYearMonth(inputs.birthYear, inputs.birthMonth, 18);
  const cppStart = { year: CPP_START_YEAR, month: 1 };
  const contribStart =
    age18.year > cppStart.year || (age18.year === cppStart.year && age18.month >= cppStart.month)
      ? age18
      : cppStart;

  // Contributory period ends the month before CPP starts (or at age 70 cap)
  const age70 = ageToYearMonth(inputs.birthYear, inputs.birthMonth, MAX_START_AGE);
  let endY = startYear;
  let endM = startMonth - 1;
  if (endM < 1) {
    endM = 12;
    endY -= 1;
  }
  if (endY > age70.year || (endY === age70.year && endM > age70.month)) {
    endY = age70.year;
    endM = age70.month;
  }

  const points = buildMonthlyPoints(inputs, effectiveEarnings, contribStart.year, contribStart.month, endY, endM);

  // Apply CRDO + disability drop-outs first
  const crdoMonthsDropped = points.filter((p) => p.inCrdo).length;
  const disabilityMonthsDropped = points.filter((p) => p.inDisability && !p.inCrdo).length;
  const remainingAfterSpecialDropouts = points.filter((p) => !p.inCrdo && !p.inDisability);

  // Index each remaining month's earnings to start-year dollars using AYMPE ratio
  const aympeStart = getAympe(startYear, inputs.assumptions.ympeGrowthRate);

  const indexedPoints = remainingAfterSpecialDropouts.map((p) => {
    const ympeYear = getYmpe(p.year, inputs.assumptions.ympeGrowthRate);
    // Monthly cap = YMPE/12; cap earnings before indexing
    const cappedMonthly = Math.min(p.monthlyEarnings, ympeYear / 12);
    const indexed = (cappedMonthly * aympeStart) / ympeYear;
    return { ...p, indexedMonthly: indexed };
  });

  // Apply general drop-out: drop the lowest 17% of months
  const totalMonths = indexedPoints.length;
  const dropCount = Math.floor(totalMonths * GENERAL_DROPOUT_RATE);
  const sorted = [...indexedPoints].sort((a, b) => a.indexedMonthly - b.indexedMonthly);
  const kept = sorted.slice(dropCount);
  const generalDropoutMonths = totalMonths - kept.length;

  const sumIndexed = kept.reduce((acc, p) => acc + p.indexedMonthly, 0);
  const ampe = kept.length > 0 ? sumIndexed / kept.length : 0;

  // Cap AMPE at AYMPE/12
  const ampeCap = aympeStart / 12;
  const ampeCapped = Math.min(ampe, ampeCap);

  // Base CPP at age 65 = AMPE × 25%
  const baseAt65 = ampeCapped * 0.25;

  // Adjustment factor for take-up age
  const adjustmentFactor = computeAdjustmentFactor(startAge);
  const monthly = baseAt65 * adjustmentFactor;

  const diag: BaseCalcDiagnostics = {
    contributoryPeriodMonths: points.length,
    crdoMonthsDropped,
    disabilityMonthsDropped,
    generalDropoutMonths,
    monthsRetained: kept.length,
    ampe: ampeCapped,
    aympeStartYear: aympeStart,
    adjustmentFactor,
  };

  return { monthly, diag, adjustmentFactor };
}

// ---------------------------------------------------------------------------
// Enhancement (Tier 1 + Tier 2) calculation
// ---------------------------------------------------------------------------

function calculateEnhancement(
  inputs: ScenarioInputs,
  effectiveEarnings: EarningsRecord[],
  startYear: number,
  startAge: number,
): { tier1Monthly: number; tier2Monthly: number; diag: EnhancementCalcDiagnostics } {
  const earningsByYear = new Map<number, number>();
  for (const r of effectiveEarnings) earningsByYear.set(r.year, r.pensionableEarnings);

  const aympeStart = getAympe(startYear, inputs.assumptions.ympeGrowthRate);
  const ayampeStart = getAyampe(startYear, inputs.assumptions.yampeGrowthRate);

  // ---- Tier 1: replacement on YMPE-band earnings (Year ≥ 2019) ----
  let tier1Sum = 0;
  let tier1Years = 0;
  for (let y = TIER1_START_YEAR; y < startYear; y++) {
    const earnings = earningsByYear.get(y) ?? 0;
    if (earnings <= 0) continue;
    const ympeY = getYmpe(y, inputs.assumptions.ympeGrowthRate);
    const tier1Earnings = Math.min(earnings, ympeY) - YBE;
    if (tier1Earnings <= 0) continue;
    const phase = TIER1_PHASE_IN[y] ?? 1.0;
    const indexed = (tier1Earnings * aympeStart) / ympeY;
    tier1Sum += indexed * phase;
    tier1Years += 1;
  }
  const tier1Accrual = Math.min(1, tier1Years / ENHANCEMENT_FULL_YEARS);
  // Annual benefit = (sum of indexed earnings × replacement rate) / years; then /12 for monthly
  const tier1AnnualAt65 =
    tier1Years > 0
      ? (tier1Sum * TIER1_FULL_REPLACEMENT_RATE) / tier1Years * tier1Accrual
      : 0;
  const adjustmentFactor = computeAdjustmentFactor(startAge);
  const tier1Monthly = (tier1AnnualAt65 * adjustmentFactor) / 12;

  // ---- Tier 2: replacement on (YMPE → YAMPE) band earnings (Year ≥ 2024) ----
  let tier2Sum = 0;
  let tier2Years = 0;
  for (let y = TIER2_START_YEAR; y < startYear; y++) {
    const earnings = earningsByYear.get(y) ?? 0;
    if (earnings <= 0) continue;
    const ympeY = getYmpe(y, inputs.assumptions.ympeGrowthRate);
    const yampeY = getYampe(y, inputs.assumptions.yampeGrowthRate);
    const tier2Earnings = Math.min(earnings, yampeY) - ympeY;
    if (tier2Earnings <= 0) continue;
    const indexed = (tier2Earnings * ayampeStart) / yampeY;
    tier2Sum += indexed;
    tier2Years += 1;
  }
  const tier2Accrual = Math.min(1, tier2Years / ENHANCEMENT_FULL_YEARS);
  const tier2AnnualAt65 =
    tier2Years > 0
      ? (tier2Sum * TIER2_REPLACEMENT_RATE) / tier2Years * tier2Accrual
      : 0;
  // Tier 2 uses the same adjustment factors here for simplicity
  const tier2Monthly = (tier2AnnualAt65 * adjustmentFactor) / 12;

  return {
    tier1Monthly,
    tier2Monthly,
    diag: {
      tier1ContributionYears: tier1Years,
      tier1AccrualFactor: tier1Accrual,
      tier2ContributionYears: tier2Years,
      tier2AccrualFactor: tier2Accrual,
      tier1IndexedEarningsSum: tier1Sum,
      tier2IndexedEarningsSum: tier2Sum,
    },
  };
}

// ---------------------------------------------------------------------------
// Adjustment factor + breakeven projection
// ---------------------------------------------------------------------------

export function computeAdjustmentFactor(startAge: number): number {
  if (startAge < MIN_START_AGE || startAge > MAX_START_AGE) {
    // Clamp out-of-range; users shouldn't be able to choose these but be safe
    startAge = Math.min(Math.max(startAge, MIN_START_AGE), MAX_START_AGE);
  }
  if (startAge === 65) return 1;
  if (startAge < 65) {
    const monthsEarly = Math.round((65 - startAge) * 12);
    return 1 - EARLY_ADJUSTMENT_PER_MONTH * monthsEarly;
  }
  const monthsLate = Math.round((startAge - 65) * 12);
  return 1 + LATE_ADJUSTMENT_PER_MONTH * monthsLate;
}

/**
 * Project nominal annual benefit forward, applying indexing each year.
 * Includes Post-Retirement Benefit accrual if the user continues working.
 */
function projectCumulative(
  startMonthly: number,
  startAge: number,
  startYear: number,
  indexingRate: number,
  prb: PostRetirementBenefit | undefined,
  ympeAtStart: number,
  ympeGrowthRate: number,
  toAge: number = 95,
): { age: number; cumulativeNominal: number; annualNominal: number }[] {
  const results: { age: number; cumulativeNominal: number; annualNominal: number }[] = [];
  let cumulative = 0;
  let monthly = startMonthly;
  let year = startYear;
  // Track PRB accrual: each year of continued work after start adds ~1/40 of max base for that year
  let prbMonthly = 0;
  for (let age = startAge; age <= toAge; age += 1) {
    const indexed = monthly + prbMonthly;
    const annualNominal = indexed * 12;
    cumulative += annualNominal;
    results.push({ age, cumulativeNominal: cumulative, annualNominal });

    // PRB accrual: simplified - each year of work earns PRB equal to ~2.5% of annual benefit accrued
    if (prb?.continuesWorkingAfterStart && (prb.stopAge ?? 65) > age && (prb.annualEarningsAfterStart ?? 0) > 0) {
      const ympeY = ympeAtStart * Math.pow(1 + ympeGrowthRate, age - startAge);
      const ratio = Math.min(1, (prb.annualEarningsAfterStart ?? 0) / ympeY);
      // Annual PRB ≈ 1/40 × max retirement benefit × adjustment for take-up age × earnings ratio
      const maxAnnualBaseAtStart = startMonthly * 12;
      const prbThisYear = (maxAnnualBaseAtStart / 40) * ratio;
      prbMonthly += prbThisYear / 12;
    }

    // Index for next year
    monthly = monthly * (1 + indexingRate);
    prbMonthly = prbMonthly * (1 + indexingRate);
    year += 1;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function calculateCpp(inputs: ScenarioInputs): CalculationResult {
  const warnings: string[] = [];

  // Validate inputs
  if (!inputs.startAges || inputs.startAges.length === 0) {
    return { byStartAge: [], effectiveEarnings: [], warnings: ["No start ages provided"] };
  }
  if (inputs.birthYear < 1900) warnings.push("Birth year looks unreasonable");

  // Latest start year we need to project to
  const latestStartAge = Math.max(...inputs.startAges);
  const latestStart = ageToYearMonth(inputs.birthYear, inputs.birthMonth, latestStartAge);

  const effectiveEarnings = buildEffectiveEarnings(inputs, latestStart.year);

  // Check for negative earnings
  for (const r of effectiveEarnings) {
    if (r.pensionableEarnings < 0) {
      warnings.push(`Negative pensionable earnings in ${r.year}`);
    }
  }

  const byStartAge: StartAgeResult[] = [];
  for (const age of inputs.startAges) {
    const start = ageToYearMonth(inputs.birthYear, inputs.birthMonth, age);
    const base = calculateBase(inputs, effectiveEarnings, start.year, start.month, age);
    const enh = calculateEnhancement(inputs, effectiveEarnings, start.year, age);
    const totalMonthly = base.monthly + enh.tier1Monthly + enh.tier2Monthly;
    const ympeAtStart = getYmpe(start.year, inputs.assumptions.ympeGrowthRate);

    const cumulativeByAge = projectCumulative(
      totalMonthly,
      age,
      start.year,
      inputs.assumptions.indexingRate,
      inputs.postRetirementBenefit,
      ympeAtStart,
      inputs.assumptions.ympeGrowthRate,
    );

    byStartAge.push({
      startAge: age,
      startYear: start.year,
      startMonth: start.month,
      adjustmentFactor: base.adjustmentFactor,
      baseMonthly: base.monthly,
      tier1Monthly: enh.tier1Monthly,
      tier2Monthly: enh.tier2Monthly,
      totalMonthly,
      totalAnnual: totalMonthly * 12,
      base: base.diag,
      enhancement: enh.diag,
      cumulativeByAge,
    });
  }

  return { byStartAge, effectiveEarnings, warnings };
}

// Re-export DropoutPeriod helper for the UI
export type { DropoutPeriod };
