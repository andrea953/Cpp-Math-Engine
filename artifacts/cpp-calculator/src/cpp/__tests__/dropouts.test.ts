/**
 * Drop-out tests.
 *
 * Reference: Service Canada — "Drop-out provisions"
 *  - Child Rearing Drop-Out (CRDO): months while caring for a child under 7
 *    are removed from the contributory period.
 *  - Disability drop-out: months receiving CPP-D are removed from the
 *    contributory period (separate from CRDO).
 *  - General drop-out: lowest 17% of remaining months are dropped from the
 *    AMPE calculation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateCpp } from "../calculate";
import { YMPE_HISTORY } from "../constants";
import type { ScenarioInputs } from "../types";
import { pinYear, unpinTime } from "./_time";

beforeAll(() => pinYear(2026, 6, 15));
afterAll(() => unpinTime());

function makeInputs(over: Partial<ScenarioInputs> = {}): ScenarioInputs {
  const history = [];
  for (let y = 1979; y <= 2025; y++) {
    history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y] ?? 0 });
  }
  return {
    birthYear: 1961,
    birthMonth: 1,
    earningsHistory: history,
    assumptions: {
      ympeGrowthRate: 0.031,
      yampeGrowthRate: 0.031,
      indexingRate: 0.025,
      futureEarningsGrowthRate: 0.02,
      assumedFutureEarnings: 0,
      stopWorkAge: 65,
    },
    startAges: [65],
    ...over,
  };
}

describe("CRDO (Child Rearing Drop-Out)", () => {
  it("drops exactly the months in the CRDO period", () => {
    const baseline = calculateCpp(makeInputs()).byStartAge[0];
    const withCrdo = calculateCpp(
      makeInputs({
        dropoutPeriods: [
          // 36 months = 3 calendar years (Jan 1990 - Dec 1992)
          { kind: "crdo", startYear: 1990, startMonth: 1, endYear: 1992, endMonth: 12 },
        ],
      }),
    ).byStartAge[0];

    expect(withCrdo.base.crdoMonthsDropped).toBe(36);
    // contributoryPeriodMonths is the TOTAL window size (age 18 → start month).
    // CRDO removes months from the AMPE calculation but does not shrink that
    // window — it surfaces in `generalDropoutMonths` and `monthsRetained` instead.
    expect(withCrdo.base.contributoryPeriodMonths).toBe(baseline.base.contributoryPeriodMonths);

    // Engine accounting identity (per `calculateBase`):
    //   afterSpecial = contributoryPeriodMonths - crdoMonthsDropped - disabilityMonthsDropped
    //   generalDropoutMonths = floor(afterSpecial × 0.17)
    //   monthsRetained = afterSpecial - generalDropoutMonths
    const afterSpecial =
      withCrdo.base.contributoryPeriodMonths -
      withCrdo.base.crdoMonthsDropped -
      withCrdo.base.disabilityMonthsDropped;
    expect(withCrdo.base.generalDropoutMonths).toBe(Math.floor(afterSpecial * 0.17));
    expect(withCrdo.base.monthsRetained).toBe(afterSpecial - withCrdo.base.generalDropoutMonths);

    // And the same identity holds for the baseline (no CRDO).
    const baseAfterSpecial =
      baseline.base.contributoryPeriodMonths -
      baseline.base.crdoMonthsDropped -
      baseline.base.disabilityMonthsDropped;
    expect(baseline.base.monthsRetained).toBe(
      baseAfterSpecial - baseline.base.generalDropoutMonths,
    );
  });
});

describe("Disability drop-out", () => {
  it("does not double-count months that overlap with CRDO", () => {
    const result = calculateCpp(
      makeInputs({
        dropoutPeriods: [
          // Same 24 months marked as both CRDO and disability
          { kind: "crdo", startYear: 1990, startMonth: 1, endYear: 1991, endMonth: 12 },
          { kind: "disability", startYear: 1990, startMonth: 1, endYear: 1991, endMonth: 12 },
        ],
      }),
    ).byStartAge[0];

    // CRDO claims the months; disabilityMonthsDropped should only count
    // months that are NOT also in CRDO (i.e. zero here).
    expect(result.base.crdoMonthsDropped).toBe(24);
    expect(result.base.disabilityMonthsDropped).toBe(0);
  });

  it("counts disability months that don't overlap CRDO", () => {
    const result = calculateCpp(
      makeInputs({
        dropoutPeriods: [
          { kind: "crdo", startYear: 1990, startMonth: 1, endYear: 1990, endMonth: 12 },
          { kind: "disability", startYear: 1995, startMonth: 1, endYear: 1995, endMonth: 6 },
        ],
      }),
    ).byStartAge[0];
    expect(result.base.crdoMonthsDropped).toBe(12);
    expect(result.base.disabilityMonthsDropped).toBe(6);
  });
});

describe("General 17% drop-out", () => {
  it("drops floor(17% × contributory period) months from the lowest indexed earnings", () => {
    const result = calculateCpp(makeInputs()).byStartAge[0];
    // After post-65 drop-out (zero here at start age 65), the 17% applies to
    // contributoryPeriodMonths - crdo - disability - post65.
    const afterAllSpecial =
      result.base.contributoryPeriodMonths -
      result.base.crdoMonthsDropped -
      result.base.disabilityMonthsDropped -
      result.base.post65DropoutMonths;
    const expected = Math.floor(afterAllSpecial * 0.17);
    expect(result.base.generalDropoutMonths).toBe(expected);
  });

  it("drops the lowest-earning months: a single zero year does not move the AMPE much", () => {
    // Already covered numerically in baseCpp.test.ts; here we add the
    // diagnostic-level check that the dropped-month count equals 17% of
    // remaining months regardless of where the zeros sit.
    const inputs = makeInputs({
      earningsHistory: makeInputs().earningsHistory.map((r) =>
        r.year === 2010 ? { ...r, pensionableEarnings: 0 } : r,
      ),
    });
    const r = calculateCpp(inputs).byStartAge[0];
    const afterAllSpecial =
      r.base.contributoryPeriodMonths -
      r.base.crdoMonthsDropped -
      r.base.disabilityMonthsDropped -
      r.base.post65DropoutMonths;
    expect(r.base.generalDropoutMonths).toBe(Math.floor(afterAllSpecial * 0.17));
  });
});

describe("Post-65 / late take-up drop-out", () => {
  // Helper: a max-contributor 1961-born modeled with start ages 60, 65, 70
  // in one call. We pin YMPE/indexing growth to 0 so the AMPE cap (AYMPE/12)
  // is the same in every start year — which lets the take-up test isolate
  // the post-65 drop-out's effect from YMPE-growth-driven cap inflation.
  function trio(opts: {
    stopWorkAge?: number;
    assumedFutureEarnings?: number;
    futureEarningsGrowthRate?: number;
    ympeGrowthRate?: number;
  } = {}) {
    const base = makeInputs({ startAges: [60, 65, 70] });
    const inputs: ScenarioInputs = {
      ...base,
      assumptions: {
        ...base.assumptions,
        ympeGrowthRate: opts.ympeGrowthRate ?? 0,
        yampeGrowthRate: opts.ympeGrowthRate ?? 0,
        indexingRate: 0,
        stopWorkAge: opts.stopWorkAge ?? 65,
        assumedFutureEarnings: opts.assumedFutureEarnings ?? 0,
        futureEarningsGrowthRate: opts.futureEarningsGrowthRate ?? 0,
      },
    };
    const result = calculateCpp(inputs);
    const byAge = new Map(result.byStartAge.map((r) => [r.startAge, r]));
    return {
      r60: byAge.get(60)!,
      r65: byAge.get(65)!,
      r70: byAge.get(70)!,
    };
  }

  it("does not fire for take-up at 65 or earlier", () => {
    const { r60, r65 } = trio();
    expect(r60.base.post65DropoutMonths).toBe(0);
    expect(r65.base.post65DropoutMonths).toBe(0);
  });

  it("fires for take-up at 70 when post-65 earnings are zero (stop-working-at-65 case)", () => {
    const { r70 } = trio();
    // A 1961-born with stopWorkAge=65 and zero assumed future earnings has
    // 60 zero-earning months between turning 65 (Jan 2026) and Dec 2030
    // (the month before age 70 take-up in Jan 2031). Every one of those
    // months has indexed earnings of 0, well below the running mean, so all
    // 60 are dropped by post-65 drop-out.
    expect(r70.base.post65DropoutMonths).toBe(60);
  });

  it("delaying to 70 with zero post-65 earnings: AMPE reaches the AYMPE cap (zeros are dropped, not averaged in)", () => {
    // Direct proof the rule fires: with all 60 post-65 zero months dropped,
    // every remaining month is at YMPE-max (max contributor 1979-2025), so
    // AMPE_70 hits the AYMPE(start_year)/12 cap exactly. Without the rule,
    // AMPE_70 would be (564/624) × cap ≈ 90.4% of cap.
    const { r70 } = trio();
    expect(r70.base.ampe).toBeCloseTo(r70.base.aympeStartYear / 12, 2);
  });

  it("delaying to 70: base ratio vs age 65 is ≥ 1.42 (no longer dragged below the actuarial adjustment)", () => {
    // Before this rule, base_70 / base_65 was ~1.29 because 60 zero months
    // between age 65 and take-up dragged AMPE_70 down below AMPE_65, even
    // though the actuarial adjustment factor at 70 is 1.42. With the rule,
    // the ratio is ≥ 1.42 — possibly higher because AYMPE keeps rolling
    // forward and the start-year-70 cap exceeds the start-year-65 cap.
    const { r65, r70 } = trio();
    expect(r70.baseMonthly / r65.baseMonthly).toBeGreaterThanOrEqual(1.42);
  });

  it("does not fire for late take-up when post-65 earnings continue at YMPE-max", () => {
    // Same client but continues earning above-YMPE from 65 to 70. The cap
    // brings each post-65 month to exactly YMPE/12, which after indexing
    // equals the running mean (= AYMPE/12 cap). Since values must be
    // strictly LESS than the mean to be dropped, all post-65 months stay.
    const { r70 } = trio({
      stopWorkAge: 70,
      assumedFutureEarnings: 100_000, // comfortably above YMPE in any year
    });
    expect(r70.base.post65DropoutMonths).toBe(0);
  });
});
