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
  DISABILITY_DROP_IN_PRIOR_YEARS,
  DISABILITY_DROP_IN_RATE,
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

  // Reduce instead of `Math.max(...histYears)` for the same reason as below:
  // a malformed earningsHistory shouldn't be able to overflow the spread-arg
  // limit. In practice histYears is small (~50 entries) but defence in depth.
  let lastHistYear = inputs.birthYear + 17;
  for (const r of inputs.earningsHistory) {
    if (r.year > lastHistYear) lastHistYear = r.year;
  }

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

  // Compute min/max year via reduction rather than `Math.min(...keys, x)` —
  // spreading a Map iterator with many entries past the engine's spread-arg
  // limit (~65k in V8) throws "Maximum call stack size exceeded". This is a
  // defensive guard: with a sane birthYear `byYear` is small, but a transient
  // typo in the birth-year input (e.g. "19650") can briefly inflate the
  // projection range to hundreds of thousands of years before the next
  // render clamps it.
  let minYear = inputs.birthYear + 18;
  let maxYear = endYear;
  for (const y of byYear.keys()) {
    if (y < minYear) minYear = y;
    if (y > maxYear) maxYear = y;
  }
  const result: EarningsRecord[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    result.push({ year: y, pensionableEarnings: byYear.get(y) ?? 0 });
  }
  return result;
}

/**
 * Build a synthetic max-earner ScenarioInputs that mirrors the client (same
 * birth year/month and assumptions) but earns the maximum pensionable amount
 * every year from age 18 (or CPP start, whichever is later) up through the
 * year they take up at `startAge`. Pre-2024 the cap is YMPE; 2024+ it is
 * YAMPE so that Tier 2 contributions are also at the maximum. CRDO and
 * disability dropouts are stripped — a max earner has no special drop-out
 * months. Used to compute the true max-CPP denominator for the "% of
 * maximum" displays so a real max earner shows exactly 100%.
 */
function buildMaxEarnerInputs(inputs: ScenarioInputs, startAge: number): ScenarioInputs {
  const stopYearMonth = ageToYearMonth(inputs.birthYear, inputs.birthMonth, startAge);
  const startYear = Math.max(inputs.birthYear + 18, CPP_START_YEAR);
  const earningsHistory: EarningsRecord[] = [];
  for (let y = startYear; y <= stopYearMonth.year; y++) {
    const ympe = getYmpe(y, inputs.assumptions.ympeGrowthRate);
    const cap =
      y >= TIER2_START_YEAR ? getYampe(y, inputs.assumptions.yampeGrowthRate) : ympe;
    earningsHistory.push({ year: y, pensionableEarnings: cap });
  }
  return {
    ...inputs,
    earningsHistory,
    dropoutPeriods: [],
    assumptions: { ...inputs.assumptions, stopWorkAge: startAge },
  };
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

  // Disability drop-out first: months excluded from the contributory period by
  // reason of disability (CPP Act s. 49(c)) are removed unconditionally. Months
  // that are ALSO flagged CRDO are left for the CRDO step below, which takes
  // precedence in the diagnostics.
  const disabilityMonthsDropped = points.filter((p) => p.inDisability && !p.inCrdo).length;
  const afterDisability = points.filter((p) => !(p.inDisability && !p.inCrdo));

  // Index each remaining month's earnings to start-year dollars using the AYMPE
  // ratio. CPP Act s. 53: each year's pensionable earnings are restated in
  // start-year dollars via (Maximum Pensionable Earnings Average / that year's
  // YMPE), where the MPEA is the 5-year average ending in the benefit year
  // (AYMPE; see getAympe / s. 42(1) in constants.ts).
  const aympeStart = getAympe(startYear, inputs.assumptions.ympeGrowthRate);

  const indexedAll = afterDisability.map((p) => {
    const ympeYear = getYmpe(p.year, inputs.assumptions.ympeGrowthRate);
    // Monthly cap = YMPE/12; cap earnings before indexing
    const cappedMonthly = Math.min(p.monthlyEarnings, ympeYear / 12);
    const indexed = (cappedMonthly * aympeStart) / ympeYear;
    return { ...p, indexedMonthly: indexed };
  });

  // Child Rearing Drop-Out (CRDO) — beneficial-only.
  // CPP Act s. 48(2)(a) + s. 49(d): months while a family-allowance / child-
  // benefit recipient cared for a child under 7 may be excluded from the
  // contributory period — but ONLY where the month's earnings are below the
  // contributor's average, i.e. only when dropping the month raises the
  // benefit. Child-rearing months whose indexed earnings are at or above the
  // running mean are KEPT (they already lift AMPE). Same greedy rule as the
  // post-65 drop-out below: sort eligible months ascending and drop while the
  // lowest is strictly below the running mean.
  let crdoMonthsDropped = 0;
  let crdoMonthsDroppedByYear: { year: number; months: number }[] = [];
  let indexedPoints = indexedAll;
  if (indexedAll.some((p) => p.inCrdo)) {
    const crdoSorted = indexedAll
      .map((p, idx) => ({ idx, val: p.indexedMonthly, crdo: p.inCrdo }))
      .filter((x) => x.crdo)
      .sort((a, b) => a.val - b.val);

    let runningSum = indexedAll.reduce((acc, p) => acc + p.indexedMonthly, 0);
    let runningCount = indexedAll.length;
    const droppedIdx = new Set<number>();
    for (const m of crdoSorted) {
      const mean = runningSum / runningCount;
      if (m.val >= mean) break;
      droppedIdx.add(m.idx);
      runningSum -= m.val;
      runningCount -= 1;
    }
    crdoMonthsDropped = droppedIdx.size;
    if (crdoMonthsDropped > 0) {
      const droppedByYear = new Map<number, number>();
      for (const idx of droppedIdx) {
        const year = indexedAll[idx].year;
        droppedByYear.set(year, (droppedByYear.get(year) ?? 0) + 1);
      }
      crdoMonthsDroppedByYear = Array.from(droppedByYear, ([year, months]) => ({
        year,
        months,
      })).sort((a, b) => a.year - b.year);
    }
    if (crdoMonthsDropped > 0) {
      indexedPoints = indexedAll.filter((_, idx) => !droppedIdx.has(idx));
    }
  }

  // ---------------------------------------------------------------------------
  // Post-65 / late take-up drop-out ("age 65 drop-out")
  //
  // CPP Act s. 48(3): deductions allowed where the contributory period ends
  // after age 65. If you delay starting your retirement pension past age 65, any
  // months between age 65 and the date you start CPP are removed from the
  // contributory period IF doing so raises your benefit. This is a separate
  // provision from the 17% general drop-out and does not consume the 17%
  // allowance.
  //
  // Greedy implementation: sort post-65 months by indexed earnings ascending,
  // drop them while the lowest is strictly below the running mean (since
  // dropping a value < mean always raises the mean). Stop at the first
  // post-65 month whose value is at or above the mean — once that's reached,
  // no remaining post-65 month is below the (new, higher) mean either.
  // ---------------------------------------------------------------------------
  const age65 = ageToYearMonth(inputs.birthYear, inputs.birthMonth, 65);
  const isPost65 = (p: { year: number; month: number }) =>
    p.year > age65.year || (p.year === age65.year && p.month >= age65.month);

  let workingPoints = indexedPoints;
  let post65DropoutMonths = 0;
  if (startAge > 65 && indexedPoints.length > 0) {
    const post65Sorted = indexedPoints
      .map((p, idx) => ({ idx, val: p.indexedMonthly, post65: isPost65(p) }))
      .filter((x) => x.post65)
      .sort((a, b) => a.val - b.val);

    let runningSum = indexedPoints.reduce((acc, p) => acc + p.indexedMonthly, 0);
    let runningCount = indexedPoints.length;
    const droppedIdx = new Set<number>();
    for (const m of post65Sorted) {
      const mean = runningSum / runningCount;
      if (m.val >= mean) break;
      droppedIdx.add(m.idx);
      runningSum -= m.val;
      runningCount -= 1;
    }
    post65DropoutMonths = droppedIdx.size;
    if (post65DropoutMonths > 0) {
      workingPoints = indexedPoints.filter((_, idx) => !droppedIdx.has(idx));
    }
  }

  // Apply general drop-out: drop the lowest 17% of remaining months.
  // CPP Act s. 48(4)(a)(i) (see GENERAL_DROPOUT_RATE in constants.ts).
  const totalMonths = workingPoints.length;
  const dropCount = Math.floor(totalMonths * GENERAL_DROPOUT_RATE);
  const sorted = [...workingPoints].sort((a, b) => a.indexedMonthly - b.indexedMonthly);
  const kept = sorted.slice(dropCount);
  const generalDropoutMonths = totalMonths - kept.length;

  const sumIndexed = kept.reduce((acc, p) => acc + p.indexedMonthly, 0);
  const ampe = kept.length > 0 ? sumIndexed / kept.length : 0;

  // Cap AMPE at AYMPE/12
  const ampeCap = aympeStart / 12;
  const ampeCapped = Math.min(ampe, ampeCap);

  // Base CPP at age 65 = AMPE × 25% (CPP Act s. 46(1)(a))
  const baseAt65 = ampeCapped * 0.25;

  // Adjustment factor for take-up age (CPP Act s. 46(3)–(6); factors by regulation)
  const adjustmentFactor = computeAdjustmentFactor(startAge);
  const monthly = baseAt65 * adjustmentFactor;

  const diag: BaseCalcDiagnostics = {
    contributoryPeriodMonths: points.length,
    crdoMonthsDropped,
    crdoMonthsDroppedByYear,
    disabilityMonthsDropped,
    post65DropoutMonths,
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

  // ---- DROP-IN (Enhanced CPP only) ----
  // The Enhanced CPP (1st + 2nd Additional) has no drop-out. Instead, CPP Act
  // s. 53.3(1) (1st Additional) and s. 53.4(1) (2nd Additional) provide a
  // "drop-in": low/no-earning protected periods are credited with an *imputed*
  // (proxy) income, and the higher of (real, imputed) income is used for each
  // year. Two protected periods get a drop-in:
  //
  //   - Child-rearing: imputed income = the average pensionable earnings in the
  //     5 years BEFORE the child's birth (the CRDO window's start year is taken
  //     as the birth year), applied across that window.
  //   - Disability: imputed income = 70% of the average pensionable earnings in
  //     the 6 years BEFORE disability onset (the disability window's start year),
  //     applied across that window. (canada.ca CPP amount — "Periods of
  //     disability"; CPP Act s. 53.3/53.4 additional plan.)
  //
  // If a protected period has no earnings in its prior window there is no
  // imputed income and the drop-in has no effect. Where windows overlap we keep
  // the largest imputed value for the year (Math.max).
  //
  // Granularity: like the rest of the enhanced component (which is computed from
  // annual pensionable earnings), the drop-in is applied per CALENDAR YEAR — any
  // year a window touches gets the imputed value. Period start/end MONTHS are
  // not prorated here; the base component handles month-level disability/CRDO
  // exclusion in buildMonthlyPoints above.
  const dropInByYear = new Map<number, number>();
  /** Which protected-period kind produced the (winning) imputed value for a year. */
  const dropInKindByYear = new Map<number, import("./types").DropoutKind>();
  /** Years where a drop-in actually replaced real income in Tier 1 or Tier 2 of THIS result. */
  const appliedDropInYears = new Set<number>();
  for (const period of inputs.dropoutPeriods ?? []) {
    let imputed = 0;
    if (period.kind === "crdo") {
      let prior5Sum = 0;
      for (let y = period.startYear - 5; y <= period.startYear - 1; y++) {
        prior5Sum += earningsByYear.get(y) ?? 0;
      }
      imputed = prior5Sum / 5;
    } else if (period.kind === "disability") {
      let priorSum = 0;
      for (let y = period.startYear - DISABILITY_DROP_IN_PRIOR_YEARS; y <= period.startYear - 1; y++) {
        priorSum += earningsByYear.get(y) ?? 0;
      }
      imputed = (priorSum / DISABILITY_DROP_IN_PRIOR_YEARS) * DISABILITY_DROP_IN_RATE;
    }
    if (imputed <= 0) continue;
    for (let y = period.startYear; y <= period.endYear; y++) {
      if (imputed > (dropInByYear.get(y) ?? 0)) {
        dropInByYear.set(y, imputed);
        dropInKindByYear.set(y, period.kind);
      }
    }
  }

  // ---- Tier 1: replacement on YMPE-band earnings (Year ≥ 2019) ----
  let tier1Sum = 0;
  let tier1Years = 0;
  let tier1DropInYears = 0;
  for (let y = TIER1_START_YEAR; y < startYear; y++) {
    const real = earningsByYear.get(y) ?? 0;
    const imputed = dropInByYear.get(y) ?? 0;
    const earnings = Math.max(real, imputed);
    if (earnings <= 0) continue;
    const ympeY = getYmpe(y, inputs.assumptions.ympeGrowthRate);
    const tier1Earnings = Math.min(earnings, ympeY) - YBE;
    if (tier1Earnings <= 0) continue;
    const phase = TIER1_PHASE_IN[y] ?? 1.0;
    const indexed = (tier1Earnings * aympeStart) / ympeY;
    tier1Sum += indexed * phase;
    tier1Years += 1;
    if (imputed > real) {
      tier1DropInYears += 1;
      appliedDropInYears.add(y);
    }
  }
  // 40-year (480-month) accrual basis (CPP Act s. 48.1, s. 51 phase-in)
  const tier1Accrual = Math.min(1, tier1Years / ENHANCEMENT_FULL_YEARS);
  // Annual benefit = (sum of indexed earnings × 8.33%) / years (CPP Act s. 46(1)(b)); then /12 for monthly
  const tier1AnnualAt65 =
    tier1Years > 0
      ? (tier1Sum * TIER1_FULL_REPLACEMENT_RATE) / tier1Years * tier1Accrual
      : 0;
  const adjustmentFactor = computeAdjustmentFactor(startAge);
  const tier1Monthly = (tier1AnnualAt65 * adjustmentFactor) / 12;

  // ---- Tier 2: replacement on (YMPE → YAMPE) band earnings (Year ≥ 2024) ----
  // Same child-rearing drop-in as Tier 1 (CPP Act s. 53.4(1)).
  let tier2Sum = 0;
  let tier2Years = 0;
  let tier2DropInYears = 0;
  for (let y = TIER2_START_YEAR; y < startYear; y++) {
    const real = earningsByYear.get(y) ?? 0;
    const imputed = dropInByYear.get(y) ?? 0;
    const earnings = Math.max(real, imputed);
    if (earnings <= 0) continue;
    const ympeY = getYmpe(y, inputs.assumptions.ympeGrowthRate);
    const yampeY = getYampe(y, inputs.assumptions.yampeGrowthRate);
    const tier2Earnings = Math.min(earnings, yampeY) - ympeY;
    if (tier2Earnings <= 0) continue;
    const indexed = (tier2Earnings * ayampeStart) / yampeY;
    tier2Sum += indexed;
    tier2Years += 1;
    if (imputed > real) {
      tier2DropInYears += 1;
      appliedDropInYears.add(y);
    }
  }
  // 40-year (480-month) accrual basis (CPP Act s. 48.2)
  const tier2Accrual = Math.min(1, tier2Years / ENHANCEMENT_FULL_YEARS);
  // Annual benefit = (sum of indexed earnings × 33.33%) / years (CPP Act s. 46(1)(c))
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
      tier1DropInYears,
      tier2DropInYears,
      dropInAmountsByYear: [...dropInByYear.entries()]
        .map(([year, amount]) => ({ year, amount }))
        .sort((a, b) => a.year - b.year),
      appliedCaregivingDropIns: [...appliedDropInYears]
        .filter((y) => dropInKindByYear.get(y) === "crdo")
        .map((y) => ({ year: y, amount: dropInByYear.get(y) ?? 0 }))
        .sort((a, b) => a.year - b.year),
      appliedDisabilityDropIns: [...appliedDropInYears]
        .filter((y) => dropInKindByYear.get(y) === "disability")
        .map((y) => ({ year: y, amount: dropInByYear.get(y) ?? 0 }))
        .sort((a, b) => a.year - b.year),
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

    // Post-Retirement Benefit (CPP Act s. 59.1). The statute uses 0.00625 × the
    // Maximum Pensionable Earnings Average × earnings ratio × age adjustment; here
    // we approximate as ≈ 1/40 of the contributor's own starting pension × ratio.
    if (prb?.continuesWorkingAfterStart && (prb.stopAge ?? 65) > age && (prb.annualEarningsAfterStart ?? 0) > 0) {
      const ympeY = ympeAtStart * Math.pow(1 + ympeGrowthRate, age - startAge);
      const ratio = Math.min(1, (prb.annualEarningsAfterStart ?? 0) / ympeY);
      // Annual PRB ≈ 1/40 × starting pension × earnings ratio (approximation of s. 59.1)
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

/**
 * Projected monthly benefit *including* fully-accrued Post-Retirement Benefit.
 *
 * The PRB never changes the headline monthly AT START — it builds up year by
 * year while the contributor keeps working, and plateaus once they stop. This
 * helper reads the engine's `cumulativeByAge` projection and returns the
 * monthly benefit (in START-YEAR dollars, indexing removed) once the PRB has
 * fully accrued, so the UI can surface the toggle's real effect.
 *
 * Returns `null` when no PRB applies (not working past start, zero earnings, or
 * the stop age is at/before the start age). Defaults and the "fully accrued"
 * age are kept consistent with `projectCumulative`:
 *  - stop age defaults to 65 (matching the accrual gate's `?? 65`);
 *  - PRB is fully reflected at the first integer age >= stopAge (accrual at age
 *    `a` requires `stopAge > a`), clamped to the projection horizon.
 */
export function projectedMonthlyInclPrbAtStop(
  result: Pick<StartAgeResult, "startAge" | "cumulativeByAge">,
  prb: PostRetirementBenefit | undefined,
  indexingRate: number,
): { startYearMonthly: number; atAge: number } | null {
  if (!prb?.continuesWorkingAfterStart) return null;
  if ((prb.annualEarningsAfterStart ?? 0) <= 0) return null;
  const stopAge = prb.stopAge ?? 65;
  if (stopAge <= result.startAge) return null;
  const ages = result.cumulativeByAge;
  if (ages.length === 0) return null;
  const maxAge = ages[ages.length - 1].age;
  const targetAge = Math.min(maxAge, Math.ceil(stopAge));
  const entry = ages.find((c) => c.age === targetAge) ?? ages[ages.length - 1];
  const yearsFromStart = entry.age - result.startAge;
  const startYearMonthly =
    entry.annualNominal / 12 / Math.pow(1 + indexingRate, yearsFromStart);
  return { startYearMonthly, atAge: entry.age };
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
  // Bail out early on insane birth years rather than letting the projection
  // loop run for hundreds of thousands of iterations (which crashes the UI
  // mid-edit if the user types e.g. "19650" before correcting it). Anything
  // outside [1900, 2100] cannot produce a meaningful CPP projection anyway.
  if (
    !Number.isFinite(inputs.birthYear) ||
    inputs.birthYear < 1900 ||
    inputs.birthYear > 2100
  ) {
    return {
      byStartAge: [],
      effectiveEarnings: [],
      warnings: [`Birth year ${inputs.birthYear} is out of range (1900-2100)`],
    };
  }

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

    // Compute the TRUE maximum CPP retirement pension by running the same
    // base + Tier 1 + Tier 2 pipeline against a synthetic max earner: someone
    // with this same birth year/month who hit the YMPE every year (and the
    // YAMPE for 2024+, the Tier 2 ceiling). Service Canada's published
    // MAX_BENEFIT_AT_65 table only covers BASE CPP, so using it as the
    // denominator caused a true max earner to display ~103–105% once Tier 1
    // and Tier 2 enhancements were included in the numerator. This synthetic
    // computation keeps numerator and denominator on the same footing — a
    // true max earner now lands at exactly 100%.
    const maxInputs = buildMaxEarnerInputs(inputs, age);
    const maxEffective = buildEffectiveEarnings(maxInputs, start.year);
    const maxBase = calculateBase(maxInputs, maxEffective, start.year, start.month, age);
    const maxEnh = calculateEnhancement(maxInputs, maxEffective, start.year, age);
    const maxMonthlyAtStart = maxBase.monthly + maxEnh.tier1Monthly + maxEnh.tier2Monthly;
    // The "% of age-65 max" framing strips out the actuarial factor in the
    // denominator so the ratio scales with timing (≈64% at 60, ≈142% at 70
    // for a max earner). Algebraically: max-at-65 in start-year dollars =
    // maxMonthlyAtStart / adjustmentFactor.
    const maxAt65AtStartYear =
      base.adjustmentFactor > 0 ? maxMonthlyAtStart / base.adjustmentFactor : 0;
    // Two complementary "% of maximum" framings (see types.ts):
    //   percentOfMaximum     — vs. someone taking up at this same age (ratio
    //                          invariant across start ages; measures earnings
    //                          record strength).
    //   percentOfAge65Maximum — vs. the un-adjusted age-65 max (scales with
    //                          the actuarial factor; visualises timing).
    const percentOfMaximum = maxMonthlyAtStart > 0 ? totalMonthly / maxMonthlyAtStart : 0;
    const percentOfAge65Maximum = maxAt65AtStartYear > 0 ? totalMonthly / maxAt65AtStartYear : 0;

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
      maxMonthlyAtStart,
      percentOfMaximum,
      maxMonthlyAtAge65: maxAt65AtStartYear,
      percentOfAge65Maximum,
      base: base.diag,
      enhancement: enh.diag,
      cumulativeByAge,
    });
  }

  return { byStartAge, effectiveEarnings, warnings };
}

// Re-export DropoutPeriod helper for the UI
export type { DropoutPeriod };
