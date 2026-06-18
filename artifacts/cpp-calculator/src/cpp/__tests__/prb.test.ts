/**
 * Post-Retirement Benefit (PRB) tests.
 *
 * NOTE: The engine's PRB model is a SIMPLIFIED PROXY:
 *   PRB this year ≈ (max base annual / 40) × (earnings/YMPE ratio)
 * The regulatory formula is more involved (it depends on actual additional
 * contributions made each year). This test suite only verifies the
 * directional and structural properties of the proxy:
 *   (a) zero when not continuing to work
 *   (b) growing year-over-year while still working
 *   (c) stops accruing at stopAge
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateCpp, projectedMonthlyInclPrbAtStop } from "../calculate";
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
      indexingRate: 0,
      futureEarningsGrowthRate: 0.02,
      assumedFutureEarnings: 0,
      stopWorkAge: 65,
    },
    startAges: [60],
    ...over,
  };
}

describe("PRB", () => {
  it("is zero when continuesWorkingAfterStart is false (annualNominal stays flat)", () => {
    const inputs = makeInputs({
      startAges: [60],
      postRetirementBenefit: { continuesWorkingAfterStart: false },
    });
    const r = calculateCpp(inputs).byStartAge[0];
    const ann60 = r.cumulativeByAge.find((c) => c.age === 60)!.annualNominal;
    const ann64 = r.cumulativeByAge.find((c) => c.age === 64)!.annualNominal;
    // Indexing rate is 0 and there's no PRB, so annualNominal should be constant.
    expect(ann64).toBeCloseTo(ann60, 2);
  });

  it("grows year-over-year while the user keeps working past the start age", () => {
    const inputs = makeInputs({
      startAges: [60],
      postRetirementBenefit: {
        continuesWorkingAfterStart: true,
        annualEarningsAfterStart: 60000,
        stopAge: 65,
      },
    });
    const r = calculateCpp(inputs).byStartAge[0];
    const ann60 = r.cumulativeByAge.find((c) => c.age === 60)!.annualNominal;
    const ann61 = r.cumulativeByAge.find((c) => c.age === 61)!.annualNominal;
    const ann62 = r.cumulativeByAge.find((c) => c.age === 62)!.annualNominal;
    expect(ann61).toBeGreaterThan(ann60);
    expect(ann62).toBeGreaterThan(ann61);
  });

  it("stops accruing at stopAge: years after stopAge do not add new PRB", () => {
    const inputs = makeInputs({
      startAges: [60],
      postRetirementBenefit: {
        continuesWorkingAfterStart: true,
        annualEarningsAfterStart: 60000,
        stopAge: 63,
      },
    });
    const r = calculateCpp(inputs).byStartAge[0];
    // After age 63 with indexing rate 0, the annual amount should plateau.
    const ann63 = r.cumulativeByAge.find((c) => c.age === 63)!.annualNominal;
    const ann64 = r.cumulativeByAge.find((c) => c.age === 64)!.annualNominal;
    const ann70 = r.cumulativeByAge.find((c) => c.age === 70)!.annualNominal;
    expect(ann64).toBeCloseTo(ann63, 2);
    expect(ann70).toBeCloseTo(ann63, 2);
  });
});

describe("projectedMonthlyInclPrbAtStop (results-panel helper)", () => {
  const inputs = makeInputs({
    startAges: [60],
    postRetirementBenefit: {
      continuesWorkingAfterStart: true,
      annualEarningsAfterStart: 60000,
      stopAge: 65,
    },
  });
  const result = calculateCpp(inputs).byStartAge[0];
  // Indexing rate is 0 in makeInputs, so the start-year monthly equals
  // annualNominal / 12 at the reported age (no deflation needed here).
  const monthlyAt = (age: number) =>
    result.cumulativeByAge.find((c) => c.age === age)!.annualNominal / 12;

  it("returns null when not working past start", () => {
    expect(
      projectedMonthlyInclPrbAtStop(
        result,
        { continuesWorkingAfterStart: false },
        0,
      ),
    ).toBeNull();
  });

  it("returns null when earnings are zero", () => {
    expect(
      projectedMonthlyInclPrbAtStop(
        result,
        { continuesWorkingAfterStart: true, annualEarningsAfterStart: 0, stopAge: 65 },
        0,
      ),
    ).toBeNull();
  });

  it("returns null when stopAge is at or before the start age", () => {
    expect(
      projectedMonthlyInclPrbAtStop(
        result,
        { continuesWorkingAfterStart: true, annualEarningsAfterStart: 60000, stopAge: 60 },
        0,
      ),
    ).toBeNull();
  });

  it("reports the fully-accrued monthly at the stop age", () => {
    const got = projectedMonthlyInclPrbAtStop(
      result,
      { continuesWorkingAfterStart: true, annualEarningsAfterStart: 60000, stopAge: 65 },
      0,
    )!;
    expect(got.atAge).toBe(65);
    expect(got.startYearMonthly).toBeCloseTo(monthlyAt(65), 2);
    // PRB makes the projected monthly strictly larger than the headline start monthly.
    expect(got.startYearMonthly).toBeGreaterThan(result.totalMonthly);
  });

  it("rounds a fractional stopAge up to the first fully-accrued integer age", () => {
    const got = projectedMonthlyInclPrbAtStop(
      result,
      { continuesWorkingAfterStart: true, annualEarningsAfterStart: 60000, stopAge: 64.5 },
      0,
    )!;
    expect(got.atAge).toBe(65);
  });

  it("clamps a stopAge beyond the projection horizon to the last projected age", () => {
    const lastAge = result.cumulativeByAge[result.cumulativeByAge.length - 1].age;
    const got = projectedMonthlyInclPrbAtStop(
      result,
      { continuesWorkingAfterStart: true, annualEarningsAfterStart: 60000, stopAge: 200 },
      0,
    )!;
    expect(got.atAge).toBe(lastAge);
  });

  it("defaults stopAge to 65 (engine-consistent) when undefined", () => {
    const got = projectedMonthlyInclPrbAtStop(
      result,
      { continuesWorkingAfterStart: true, annualEarningsAfterStart: 60000 },
      0,
    )!;
    expect(got.atAge).toBe(65);
  });
});
