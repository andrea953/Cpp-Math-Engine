/**
 * Tier 2 (CPP enhancement, 2024-) tests.
 *
 * Reference: Service Canada — "Second additional CPP contribution"
 *  - Replacement on indexed earnings between YMPE and YAMPE only.
 *  - 33 1/3% replacement rate at full accrual (40 years).
 *  - Indexed using AYAMPE.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateCpp } from "../calculate";
import {
  TIER2_REPLACEMENT_RATE,
  TIER2_START_YEAR,
  YAMPE_HISTORY,
  YMPE_HISTORY,
  getAyampe,
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

describe("Tier 2 indexed earnings sum", () => {
  it("reflects only the band between YMPE and YAMPE for years with earnings at YAMPE", () => {
    const history = [];
    for (let y = TIER2_START_YEAR; y <= 2025; y++) {
      history.push({ year: y, pensionableEarnings: YAMPE_HISTORY[y] ?? YMPE_HISTORY[y] ?? 0 });
    }
    const r = calculateCpp(makeInputs({ earningsHistory: history })).byStartAge[0];

    const ayampeStart = getAyampe(2026, 0.031);
    let expected = 0;
    let years = 0;
    for (let y = TIER2_START_YEAR; y < 2026; y++) {
      const ympeY = YMPE_HISTORY[y]!;
      const yampeY = YAMPE_HISTORY[y]!;
      const tier2Earnings = yampeY - ympeY;
      const indexed = (tier2Earnings * ayampeStart) / yampeY;
      expected += indexed;
      years += 1;
    }
    expect(r.enhancement.tier2IndexedEarningsSum).toBeCloseTo(expected, 2);
    expect(r.enhancement.tier2ContributionYears).toBe(years);
  });

  it("produces a Tier 2 monthly consistent with replacement rate × indexed sum / years × accrual / 12", () => {
    const history = [];
    for (let y = TIER2_START_YEAR; y <= 2025; y++) {
      history.push({ year: y, pensionableEarnings: YAMPE_HISTORY[y] ?? YMPE_HISTORY[y] ?? 0 });
    }
    const r = calculateCpp(makeInputs({ earningsHistory: history })).byStartAge[0];
    const sum = r.enhancement.tier2IndexedEarningsSum;
    const years = r.enhancement.tier2ContributionYears;
    const accrual = r.enhancement.tier2AccrualFactor;
    const expectedMonthly = ((sum * TIER2_REPLACEMENT_RATE) / years * accrual) / 12;
    // Adjustment factor at age 65 is 1
    expect(r.tier2Monthly).toBeCloseTo(expectedMonthly, 2);
  });
});

describe("Tier 2 zero output preconditions", () => {
  it("is zero when earnings are at or below YMPE (no band-2 earnings)", () => {
    const history = [];
    for (let y = TIER2_START_YEAR; y <= 2025; y++) {
      history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y]! });
    }
    const r = calculateCpp(makeInputs({ earningsHistory: history })).byStartAge[0];
    expect(r.tier2Monthly).toBe(0);
    expect(r.enhancement.tier2ContributionYears).toBe(0);
  });

  it("is zero when start year ≤ 2024 (no Tier 2 contribution years available)", () => {
    // Person retires at 65 in 2023 (born 1958)
    const inputs = makeInputs({
      birthYear: 1958,
      birthMonth: 1,
      startAges: [65],
      earningsHistory: [{ year: 2022, pensionableEarnings: YMPE_HISTORY[2022]! }],
    });
    const r = calculateCpp(inputs).byStartAge[0];
    expect(r.tier2Monthly).toBe(0);
    expect(r.enhancement.tier2ContributionYears).toBe(0);
  });
});
