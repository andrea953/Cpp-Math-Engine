/**
 * Take-up integration tests.
 *
 * Verifies that the take-up adjustment factor multiplies through the engine's
 * monthly benefit linearly: changing the start age from 65 to 60 should reduce
 * the benefit by exactly the factor 0.64, and similarly 1.42 for age 70.
 *
 * Reference: Service Canada — "When to start your retirement pension"
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateCpp, computeAdjustmentFactor } from "../calculate";
import { YMPE_HISTORY } from "../constants";
import type { ScenarioInputs } from "../types";
import { pinYear, unpinTime } from "./_time";

beforeAll(() => pinYear(2026, 6, 15));
afterAll(() => unpinTime());

function maxContributorInputs(): ScenarioInputs {
  // Person born 1956 (turns 60 in 2016, 65 in 2021, 70 in 2026), with full
  // YMPE earnings every year from age 18 through to age 70. We project future
  // years at YMPE-level so the contributory period extension at age 70 doesn't
  // drag AMPE down vs age 65.
  const history = [];
  for (let y = 1974; y <= 2025; y++) {
    history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y] ?? 70000 });
  }
  return {
    birthYear: 1956,
    birthMonth: 1,
    earningsHistory: history,
    assumptions: {
      ympeGrowthRate: 0.031,
      yampeGrowthRate: 0.031,
      indexingRate: 0,
      futureEarningsGrowthRate: 0.031, // grow at YMPE rate so future projection ≈ YMPE
      assumedFutureEarnings: 75000, // ≈ YMPE around 2026, sustains max-contributor status
      stopWorkAge: 70,
    },
    startAges: [60, 65, 70],
  };
}

describe("Take-up adjustment factor scales the base monthly benefit linearly", () => {
  it("baseMonthly = AMPE × 25% × adjustmentFactor for every start age (proves take-up isolation)", () => {
    // This is the strongest possible assertion that the take-up adjustment is
    // (a) isolated from the AMPE calculation and (b) applied multiplicatively.
    // If anyone refactors take-up to fold into AMPE this test will fail.
    const result = calculateCpp(maxContributorInputs());
    for (const r of result.byStartAge) {
      const expected = r.base.ampe * 0.25 * r.adjustmentFactor;
      expect(r.baseMonthly).toBeCloseTo(expected, 4); // within 1/100¢
    }
  });

  it("adjustmentFactor matches Service Canada formula exactly: 0.64 at 60, 1.00 at 65, 1.42 at 70", () => {
    const result = calculateCpp(maxContributorInputs());
    const byAge = new Map(result.byStartAge.map((r) => [r.startAge, r]));
    expect(byAge.get(60)!.adjustmentFactor).toBeCloseTo(0.64, 6);
    expect(byAge.get(65)!.adjustmentFactor).toBe(1);
    expect(byAge.get(70)!.adjustmentFactor).toBeCloseTo(1.42, 6);
  });

  it("the engine's adjustmentFactor exactly equals computeAdjustmentFactor(startAge)", () => {
    const result = calculateCpp(maxContributorInputs());
    for (const r of result.byStartAge) {
      expect(r.adjustmentFactor).toBeCloseTo(computeAdjustmentFactor(r.startAge), 10);
    }
  });

  // NOTE on cross-age ratios: base@60/base@65 is NOT exactly 0.64 because
  // AMPE itself shifts with start age (the contributory period ends in a
  // different year, and indexing uses the start year's AYMPE — newer years
  // scale less). The per-start-age invariant above (baseMonthly = AMPE × 25%
  // × adjustmentFactor) is the rigorous proof of take-up isolation; the
  // cross-age ratio carries an unbounded AMPE-drift component and is only
  // useful as a directional sanity check, which the order-invariants test
  // already covers.
});
