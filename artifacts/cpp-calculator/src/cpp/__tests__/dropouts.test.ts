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
    const expected = Math.floor(result.base.contributoryPeriodMonths * 0.17);
    expect(result.base.generalDropoutMonths).toBe(expected);
  });

  it("drops the lowest-earning months: a single zero year does not move the AMPE much", () => {
    // Already covered numerically in baseCpp.test.ts; here we add the
    // diagnostic-level check that the dropped-month count equals 17% of
    // contributory period regardless of where the zeros sit.
    const inputs = makeInputs({
      earningsHistory: makeInputs().earningsHistory.map((r) =>
        r.year === 2010 ? { ...r, pensionableEarnings: 0 } : r,
      ),
    });
    const r = calculateCpp(inputs).byStartAge[0];
    expect(r.base.generalDropoutMonths).toBe(
      Math.floor(r.base.contributoryPeriodMonths * 0.17),
    );
  });
});
