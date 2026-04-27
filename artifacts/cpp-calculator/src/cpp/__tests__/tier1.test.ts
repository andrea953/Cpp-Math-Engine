/**
 * Tier 1 (CPP enhancement, 2019-) phase-in tests.
 *
 * Reference: Service Canada — "Canada Pension Plan enhancement"
 *  - 2019: 15%   2020: 30%   2021: 50%   2022: 75%   2023+: 100%
 *  - Replacement on indexed YMPE-band earnings (gross - YBE), capped at YMPE.
 *  - Full accrual at 40 years of contributions; pro-rata otherwise.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateCpp } from "../calculate";
import {
  ENHANCEMENT_FULL_YEARS,
  TIER1_PHASE_IN,
  TIER1_START_YEAR,
  YBE,
  YMPE_HISTORY,
  getAympe,
} from "../constants";
import type { ScenarioInputs } from "../types";
import { pinYear, unpinTime } from "./_time";

beforeAll(() => pinYear(2026, 6, 15));
afterAll(() => unpinTime());

function makeInputs(over: Partial<ScenarioInputs> = {}): ScenarioInputs {
  return {
    birthYear: 1961, // turns 65 in 2026
    birthMonth: 1,
    earningsHistory: [],
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

describe("Tier 1 indexed earnings sum", () => {
  it("sums each year's contribution with the correct phase-in factor (15/30/50/75/100%)", () => {
    const history = [];
    for (let y = TIER1_START_YEAR; y <= 2025; y++) {
      history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y] ?? 0 });
    }
    const result = calculateCpp(makeInputs({ earningsHistory: history }));
    const r = result.byStartAge[0];

    const aympeStart = getAympe(2026, 0.031);
    let expected = 0;
    let years = 0;
    for (let y = TIER1_START_YEAR; y < 2026; y++) {
      const ympeY = YMPE_HISTORY[y]!;
      const tier1Earnings = Math.min(ympeY, ympeY) - YBE;
      const phase = TIER1_PHASE_IN[y] ?? 1.0;
      const indexed = (tier1Earnings * aympeStart) / ympeY;
      expected += indexed * phase;
      years += 1;
    }
    expect(r.enhancement.tier1IndexedEarningsSum).toBeCloseTo(expected, 2);
    expect(r.enhancement.tier1ContributionYears).toBe(years);
  });
});

describe("Tier 1 accrual factor", () => {
  it("equals years/40 for less-than-full contribution histories", () => {
    const history = [];
    // 5 years of YMPE earnings 2019-2023
    for (let y = 2019; y <= 2023; y++) {
      history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y]! });
    }
    const r = calculateCpp(makeInputs({ earningsHistory: history })).byStartAge[0];
    expect(r.enhancement.tier1ContributionYears).toBe(5);
    expect(r.enhancement.tier1AccrualFactor).toBeCloseTo(5 / ENHANCEMENT_FULL_YEARS, 6);
  });

  it("caps at exactly 1.0 once contribution years reach the 40-year threshold", () => {
    // Simulate a full 40+ years of YMPE contributions across the post-2019
    // span by retiring much later (start age 65 in a far-future year). Person
    // born 2000, retires at 65 in 2065 → 46 post-2018 contribution years.
    const inputs = makeInputs({
      birthYear: 2000,
      birthMonth: 1,
      startAges: [65],
      earningsHistory: Array.from({ length: 46 }, (_, i) => ({
        year: 2019 + i, // 2019..2064
        pensionableEarnings: 70000, // any value > YBE produces a Tier 1 contribution year
      })),
    });
    const r = calculateCpp(inputs).byStartAge[0];
    expect(r.enhancement.tier1ContributionYears).toBe(46);
    // 46 / 40 capped at 1.0
    expect(r.enhancement.tier1AccrualFactor).toBe(1);
  });

  it("equals 7/40 (not capped) for a 7-year contribution history", () => {
    const inputs = makeInputs({
      earningsHistory: Array.from({ length: 7 }, (_, i) => ({
        year: 2019 + i,
        pensionableEarnings: YMPE_HISTORY[2019 + i]!,
      })),
    });
    const r = calculateCpp(inputs).byStartAge[0];
    expect(r.enhancement.tier1AccrualFactor).toBeLessThan(1);
    expect(r.enhancement.tier1AccrualFactor).toBeCloseTo(7 / ENHANCEMENT_FULL_YEARS, 6);
  });
});

describe("Tier 1 zero output preconditions", () => {
  it("is zero when start year ≤ 2019 (no enhancement years available)", () => {
    // Person retires at 65 in 2018 (born 1953)
    const inputs = makeInputs({
      birthYear: 1953,
      birthMonth: 1,
      startAges: [65],
      earningsHistory: [{ year: 2017, pensionableEarnings: YMPE_HISTORY[2017]! }],
    });
    const r = calculateCpp(inputs).byStartAge[0];
    expect(r.tier1Monthly).toBe(0);
    expect(r.enhancement.tier1ContributionYears).toBe(0);
  });

  it("is zero when YMPE earnings for the year are at or below YBE", () => {
    const r = calculateCpp(
      makeInputs({
        earningsHistory: [
          { year: 2019, pensionableEarnings: YBE },
          { year: 2020, pensionableEarnings: 0 },
          { year: 2021, pensionableEarnings: YBE - 1 },
        ],
      }),
    ).byStartAge[0];
    expect(r.tier1Monthly).toBe(0);
  });
});
