/**
 * Earnings projection tests.
 *
 * Covers `buildEffectiveEarnings` behaviour:
 *  - History-only (no projection beyond history)
 *  - History + assumed-future projection from current calendar year
 *  - History extending past current year (projection continues from lastHistYear+1)
 *  - stopWorkAge truncates the projection
 *  - History values are never overwritten
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildEffectiveEarnings, calculateCpp } from "../calculate";
import type { ScenarioInputs } from "../types";
import { pinYear, unpinTime } from "./_time";

beforeAll(() => pinYear(2026, 6, 15));
afterAll(() => unpinTime());

function baseInputs(over: Partial<ScenarioInputs> = {}): ScenarioInputs {
  return {
    birthYear: 1965,
    birthMonth: 6,
    earningsHistory: [],
    assumptions: {
      ympeGrowthRate: 0.031,
      yampeGrowthRate: 0.031,
      indexingRate: 0.025,
      futureEarningsGrowthRate: 0.02,
      assumedFutureEarnings: 60000,
      stopWorkAge: 65,
    },
    startAges: [65],
    ...over,
  };
}

describe("buildEffectiveEarnings", () => {
  it("returns only history when there is no future projection requested", () => {
    const inputs = baseInputs({
      earningsHistory: [
        { year: 2020, pensionableEarnings: 50000 },
        { year: 2021, pensionableEarnings: 51000 },
      ],
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0.025,
        futureEarningsGrowthRate: 0,
        assumedFutureEarnings: 0,
        stopWorkAge: 60, // already passed for someone born 1965 in 2026
      },
      startAges: [65],
    });
    const result = buildEffectiveEarnings(inputs, 2021);
    const map = new Map(result.map((r) => [r.year, r.pensionableEarnings]));
    expect(map.get(2020)).toBe(50000);
    expect(map.get(2021)).toBe(51000);
  });

  it("projects future earnings from the current calendar year when history ends earlier", () => {
    const inputs = baseInputs({
      birthYear: 1965,
      birthMonth: 1,
      earningsHistory: [{ year: 2018, pensionableEarnings: 60000 }],
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0.025,
        futureEarningsGrowthRate: 0.02,
        assumedFutureEarnings: 70000,
        stopWorkAge: 65,
      },
      startAges: [65],
    });
    // Pinned year is 2026. Person turns 65 in 2030.
    const result = buildEffectiveEarnings(inputs, 2030);
    const map = new Map(result.map((r) => [r.year, r.pensionableEarnings]));
    // History year preserved exactly
    expect(map.get(2018)).toBe(60000);
    // Projection starts at min(lastHistYear+1, currentYear) = min(2019, 2026) = 2019.
    // First projected year (2019) = 70000, then growing 2% per year.
    expect(map.get(2019)).toBeCloseTo(70000, 4);
    expect(map.get(2020)).toBeCloseTo(70000 * 1.02, 4);
    expect(map.get(2026)).toBeCloseTo(70000 * Math.pow(1.02, 7), 4);
  });

  it("projects assumed earnings to cover the current calendar year when history runs short", () => {
    const inputs = baseInputs({
      birthYear: 1965,
      birthMonth: 1,
      earningsHistory: [{ year: 2024, pensionableEarnings: 65000 }],
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0.025,
        futureEarningsGrowthRate: 0.02,
        assumedFutureEarnings: 75000,
        stopWorkAge: 65,
      },
      startAges: [65],
    });
    // History ends 2024, currentYear pinned to 2026, so projection starts 2025.
    const result = buildEffectiveEarnings(inputs, 2030);
    const map = new Map(result.map((r) => [r.year, r.pensionableEarnings]));
    expect(map.get(2024)).toBe(65000);
    expect(map.get(2025)).toBeCloseTo(75000, 4);
    expect(map.get(2026)).toBeCloseTo(75000 * 1.02, 4);
  });

  it("does not overwrite a year that is already in the earnings history", () => {
    const inputs = baseInputs({
      birthYear: 1965,
      birthMonth: 1,
      earningsHistory: [
        { year: 2024, pensionableEarnings: 40000 },
        { year: 2026, pensionableEarnings: 42000 }, // current year present in history
      ],
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0.025,
        futureEarningsGrowthRate: 0.02,
        assumedFutureEarnings: 99999,
        stopWorkAge: 65,
      },
      startAges: [65],
    });
    const result = buildEffectiveEarnings(inputs, 2030);
    const map = new Map(result.map((r) => [r.year, r.pensionableEarnings]));
    // The two history entries are preserved exactly — the 99999 projection
    // value MUST NOT overwrite either of them.
    expect(map.get(2024)).toBe(40000);
    expect(map.get(2026)).toBe(42000);
    // Projection starts at min(lastHistYear+1, currentYear) = min(2027, 2026)
    // = 2026, so the gap year 2025 is NOT filled (that's a known engine
    // contract — the projection only walks forward from its start, not
    // backward to fill internal gaps).
    expect(map.get(2025) ?? 0).toBe(0);
  });

  it("truncates the projection at stopWorkAge", () => {
    const inputs = baseInputs({
      birthYear: 1965,
      birthMonth: 1,
      earningsHistory: [{ year: 2024, pensionableEarnings: 60000 }],
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0.025,
        futureEarningsGrowthRate: 0.02,
        assumedFutureEarnings: 70000,
        stopWorkAge: 62, // person turns 62 in 2027
      },
      startAges: [65],
    });
    const result = buildEffectiveEarnings(inputs, 2030);
    const map = new Map(result.map((r) => [r.year, r.pensionableEarnings]));
    expect(map.get(2027)).toBeGreaterThan(0); // still working at 62
    // 2028+ is past stopWorkAge; the buildEffectiveEarnings range fills with 0.
    expect(map.get(2028)).toBe(0);
    expect(map.get(2030)).toBe(0);
  });

  it("continues projecting from lastHistYear+1 when history extends past the current year", () => {
    // Pinned year 2026; user has somehow entered earnings up to 2028
    const inputs = baseInputs({
      birthYear: 1965,
      birthMonth: 1,
      earningsHistory: [
        { year: 2026, pensionableEarnings: 70000 },
        { year: 2027, pensionableEarnings: 71000 },
        { year: 2028, pensionableEarnings: 72000 },
      ],
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0.025,
        futureEarningsGrowthRate: 0.02,
        assumedFutureEarnings: 80000,
        stopWorkAge: 65,
      },
      startAges: [65],
    });
    const result = buildEffectiveEarnings(inputs, 2030);
    const map = new Map(result.map((r) => [r.year, r.pensionableEarnings]));
    // History preserved verbatim
    expect(map.get(2026)).toBe(70000);
    expect(map.get(2027)).toBe(71000);
    expect(map.get(2028)).toBe(72000);
    // Projection loop starts at min(lastHistYear+1, currentYear) = min(2029, 2026)
    // = 2026 and silently compounds the assumed-future value forward through
    // the years already covered by history before writing it for the first
    // un-covered year. So 2029 gets `80000 × (1 + 0.02)^3` (skipped 2026/27/28).
    expect(map.get(2029)).toBeCloseTo(80000 * Math.pow(1.02, 3), 4);
    expect(map.get(2030)).toBeCloseTo(80000 * Math.pow(1.02, 4), 4);
  });
});

describe("calculateCpp input validation (defensive guards)", () => {
  /**
   * Regression: a transient typo in the birth-year input (e.g. "19650"
   * mid-keystroke while typing "1965") used to crash the editor with a
   * "Maximum call stack size exceeded" error. Cause: the projection loop
   * in `buildEffectiveEarnings` ran from `currentYear` to
   * `birthYear + stopWorkAge`, populating a Map with hundreds of
   * thousands of entries, which then overflowed the JS engine's
   * spread-arg limit when `Math.min(...byYear.keys(), …)` was called.
   *
   * The guard returns an empty `byStartAge` for out-of-range birth
   * years (1900-2100). The defensive switch from spread-Math.min to a
   * reduce-based min/max in `buildEffectiveEarnings` is a separate
   * defence so even an in-range scenario can't blow the stack.
   */
  it("birth years outside [1900, 2100] short-circuit to an empty result instead of crashing", () => {
    for (const birthYear of [19650, 1899, 2101, 0, -1965, 1e9, NaN, Infinity]) {
      const inputs: ScenarioInputs = {
        birthYear: birthYear as number,
        birthMonth: 6,
        earningsHistory: [],
        assumptions: {
          ympeGrowthRate: 0.031,
          yampeGrowthRate: 0.031,
          indexingRate: 0.025,
          futureEarningsGrowthRate: 0.02,
          assumedFutureEarnings: 60000,
          stopWorkAge: 65,
        },
        startAges: [60, 65, 70],
      };
      // Must not throw, and must return early with a warning.
      const result = calculateCpp(inputs);
      expect(result.byStartAge).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it("buildEffectiveEarnings does not blow the call stack even when given a degenerate endYear", () => {
    // Direct test of the spread-Math.min defence. Even if upstream
    // validation were bypassed, building 200k years of projection
    // shouldn't crash the runtime.
    const inputs: ScenarioInputs = {
      birthYear: 1965,
      birthMonth: 6,
      earningsHistory: [{ year: 2000, pensionableEarnings: 50000 }],
      assumptions: {
        ympeGrowthRate: 0,
        yampeGrowthRate: 0,
        indexingRate: 0,
        futureEarningsGrowthRate: 0,
        assumedFutureEarnings: 50000,
        stopWorkAge: 200_000,
      },
      startAges: [65],
    };
    expect(() => buildEffectiveEarnings(inputs, 200_000)).not.toThrow();
  });
});
