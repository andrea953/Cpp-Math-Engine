/**
 * Sanity-check / invariant tests.
 *
 * Properties that should hold for ANY valid input:
 *  - totalMonthly = baseMonthly + tier1Monthly + tier2Monthly
 *  - tier1Monthly is 0 whenever startYear ≤ TIER1_START_YEAR
 *  - tier2Monthly is 0 whenever startYear ≤ TIER2_START_YEAR
 *  - benefit at age 60 is strictly less than benefit at 65 with identical earnings
 *  - benefit at age 70 is strictly greater than benefit at 65 with identical earnings
 *  - CSV export (in `format.ts`) round-trips a small fixture (header + values)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { calculateCpp } from "../calculate";
import { TIER1_START_YEAR, TIER2_START_YEAR, YMPE_HISTORY } from "../constants";
import { exportToCsv } from "../format";
import { parseSoc } from "../socParser";
import type { ScenarioInputs } from "../types";
import { pinYear, unpinTime } from "./_time";

beforeAll(() => pinYear(2026, 6, 15));
afterAll(() => unpinTime());

function maxContributorInputs(over: Partial<ScenarioInputs> = {}): ScenarioInputs {
  const history = [];
  for (let y = 1979; y <= 2025; y++) {
    history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y] ?? 0 });
  }
  return {
    birthYear: 1956, // turns 60 in 2016, 70 in 2026
    birthMonth: 1,
    earningsHistory: history,
    assumptions: {
      ympeGrowthRate: 0.031,
      yampeGrowthRate: 0.031,
      indexingRate: 0,
      futureEarningsGrowthRate: 0.02,
      assumedFutureEarnings: 0,
      stopWorkAge: 70,
    },
    startAges: [60, 65, 70],
    ...over,
  };
}

describe("Invariants", () => {
  it("totalMonthly equals baseMonthly + tier1Monthly + tier2Monthly for every result", () => {
    const result = calculateCpp(maxContributorInputs());
    for (const r of result.byStartAge) {
      expect(r.totalMonthly).toBeCloseTo(r.baseMonthly + r.tier1Monthly + r.tier2Monthly, 6);
    }
  });

  it("tier1Monthly is 0 when start year ≤ TIER1_START_YEAR", () => {
    // Person retires in 2018 at age 65 → no Tier 1 years available
    const inputs: ScenarioInputs = {
      birthYear: 1953,
      birthMonth: 1,
      earningsHistory: [{ year: 2017, pensionableEarnings: YMPE_HISTORY[2017]! }],
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0,
        futureEarningsGrowthRate: 0.02,
        assumedFutureEarnings: 0,
        stopWorkAge: 65,
      },
      startAges: [65],
    };
    expect(inputs.startAges[0] + inputs.birthYear).toBeLessThanOrEqual(TIER1_START_YEAR);
    const r = calculateCpp(inputs).byStartAge[0];
    expect(r.tier1Monthly).toBe(0);
  });

  it("tier2Monthly is 0 when start year ≤ TIER2_START_YEAR", () => {
    // Person retires in 2023 at age 65
    const inputs: ScenarioInputs = {
      birthYear: 1958,
      birthMonth: 1,
      earningsHistory: [{ year: 2022, pensionableEarnings: YMPE_HISTORY[2022]! }],
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0,
        futureEarningsGrowthRate: 0.02,
        assumedFutureEarnings: 0,
        stopWorkAge: 65,
      },
      startAges: [65],
    };
    expect(inputs.startAges[0] + inputs.birthYear).toBeLessThanOrEqual(TIER2_START_YEAR);
    const r = calculateCpp(inputs).byStartAge[0];
    expect(r.tier2Monthly).toBe(0);
  });

  it("benefit at 60 is strictly less than benefit at 65 with identical earnings", () => {
    const result = calculateCpp(maxContributorInputs());
    const at60 = result.byStartAge.find((r) => r.startAge === 60)!;
    const at65 = result.byStartAge.find((r) => r.startAge === 65)!;
    expect(at60.totalMonthly).toBeLessThan(at65.totalMonthly);
  });

  it("benefit at 70 is strictly greater than benefit at 65 with identical earnings", () => {
    const result = calculateCpp(maxContributorInputs());
    const at65 = result.byStartAge.find((r) => r.startAge === 65)!;
    const at70 = result.byStartAge.find((r) => r.startAge === 70)!;
    expect(at70.totalMonthly).toBeGreaterThan(at65.totalMonthly);
  });
});

describe("CSV export round-trip", () => {
  it("exportToCsv → parseSoc preserves the (year, earnings) fixture", () => {
    // exportToCsv writes a Blob via DOM APIs; in node we capture its text
    // content by stubbing URL/createObjectURL/document.createElement minimally.
    // For round-trip purposes we'd rather build the CSV string directly via
    // the same shape exportToCsv produces and verify parseSoc reads it back.
    const fixture = [
      { year: 2020, earnings: 55000 },
      { year: 2021, earnings: 58000 },
      { year: 2022, earnings: 62000 },
    ];
    const csvText = ["year,earnings", ...fixture.map((r) => `${r.year},${r.earnings}`)].join("\n");
    const parsed = parseSoc(csvText);
    expect(parsed.records).toEqual([
      { year: 2020, pensionableEarnings: 55000 },
      { year: 2021, pensionableEarnings: 58000 },
      { year: 2022, pensionableEarnings: 62000 },
    ]);
  });

  it("exportToCsv produces a CSV whose first row is the column headers", () => {
    // Verify the actual exporter writes the expected first line by intercepting
    // the Blob it builds. This guards the format the round-trip relies on.
    const captured: string[] = [];
    const origBlob = globalThis.Blob;
    class CapturingBlob {
      constructor(parts: BlobPart[]) {
        captured.push(parts.map((p) => String(p)).join(""));
      }
    }
    // jsdom isn't loaded; supply the minimum DOM stubs exportToCsv touches.
    (globalThis as any).Blob = CapturingBlob;
    const fakeAnchor = { href: "", download: "", click: vi.fn() } as any;
    (globalThis as any).URL = {
      createObjectURL: () => "blob:fake",
      revokeObjectURL: () => undefined,
    };
    (globalThis as any).document = {
      createElement: () => fakeAnchor,
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    };
    try {
      exportToCsv(
        [
          { year: 2020, earnings: 55000 },
          { year: 2021, earnings: 58000 },
        ],
        "test.csv",
      );
      expect(captured.length).toBe(1);
      expect(captured[0].split("\n")[0]).toBe("year,earnings");
      expect(captured[0]).toContain("2020,55000");
      expect(captured[0]).toContain("2021,58000");
    } finally {
      (globalThis as any).Blob = origBlob;
      delete (globalThis as any).URL;
      delete (globalThis as any).document;
    }
  });
});
