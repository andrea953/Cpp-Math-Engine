/**
 * Constants and lookup tests.
 *
 * References:
 *  - YMPE history: Service Canada / CRA — "CPP contribution rates, maximums and exemptions"
 *  - YAMPE history (2024+): Service Canada — "Second additional maximum pensionable earnings"
 *  - Maximum CPP retirement pension at 65: CRA published indexed value, January each year
 *  - Survivor flat-rate, children's benefit: Service Canada benefit amount tables
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHILDREN_BENEFIT_HISTORY,
  MAX_BENEFIT_AT_65,
  SURVIVOR_FLAT_RATE_HISTORY,
  YAMPE_HISTORY,
  YBE,
  YMPE_HISTORY,
  getAyampe,
  getAympe,
  getChildrensBenefit,
  getMaxBenefitAt65,
  getSurvivorFlatRate,
  getYampe,
  getYmpe,
} from "../constants";
import { pinYear, unpinTime } from "./_time";

beforeAll(() => pinYear(2026, 6, 15));
afterAll(() => unpinTime());

describe("YBE constant", () => {
  it("is fixed at $3,500 (Year's Basic Exemption frozen since 1996)", () => {
    expect(YBE).toBe(3500);
  });
});

describe("YMPE history table", () => {
  it("matches published Service Canada values for canonical years", () => {
    // Spot-check a sample across the table; if any of these change, the engine's
    // base CPP golden numbers will shift and the bug should be caught here first.
    expect(YMPE_HISTORY[1966]).toBe(5000);
    expect(YMPE_HISTORY[1990]).toBe(28900);
    expect(YMPE_HISTORY[2000]).toBe(37600);
    expect(YMPE_HISTORY[2019]).toBe(57400);
    expect(YMPE_HISTORY[2024]).toBe(68500);
    expect(YMPE_HISTORY[2025]).toBe(71300);
    expect(YMPE_HISTORY[2026]).toBe(74000);
  });
});

describe("YAMPE history table", () => {
  it("starts in 2024 and matches published values", () => {
    expect(YAMPE_HISTORY[2024]).toBe(73200);
    expect(YAMPE_HISTORY[2025]).toBe(81200);
    expect(YAMPE_HISTORY[2026]).toBe(84400);
  });
});

describe("getYmpe", () => {
  it("returns table values exactly for in-table years", () => {
    expect(getYmpe(2025, 0.031)).toBe(71300);
    expect(getYmpe(1980, 0.031)).toBe(13100);
  });

  it("projects forward from the last known year using the supplied growth rate", () => {
    // 2027 = 2026 * (1 + 0.031)^1
    expect(getYmpe(2027, 0.031)).toBeCloseTo(74000 * 1.031, 4);
    // 2030 = 2026 * (1.031)^4
    expect(getYmpe(2030, 0.031)).toBeCloseTo(74000 * Math.pow(1.031, 4), 4);
  });

  it("extrapolates backward before 1966 using the growth rate", () => {
    // 1965 = 5000 / 1.031
    expect(getYmpe(1965, 0.031)).toBeCloseTo(5000 / 1.031, 4);
  });
});

describe("getYampe", () => {
  it("equals YMPE for years before 2024", () => {
    expect(getYampe(2023, 0.03)).toBe(getYmpe(2023, 0.03));
    expect(getYampe(2000, 0.03)).toBe(getYmpe(2000, 0.03));
  });

  it("returns the published 2024-2026 values", () => {
    expect(getYampe(2024, 0.03)).toBe(73200);
    expect(getYampe(2025, 0.03)).toBe(81200);
    expect(getYampe(2026, 0.03)).toBe(84400);
  });

  it("projects forward from 2026 using the growth rate", () => {
    expect(getYampe(2028, 0.04)).toBeCloseTo(84400 * Math.pow(1.04, 2), 4);
  });
});

describe("getAympe (5-year average YMPE ending in `year`)", () => {
  it("returns the simple arithmetic mean of YMPE for `year` and the prior 4", () => {
    const expected = (74000 + 71300 + 68500 + 66600 + 64900) / 5;
    expect(getAympe(2026, 0.031)).toBeCloseTo(expected, 4);
  });

  it("works for projected start years by averaging projected YMPE values", () => {
    const g = 0.031;
    const ympes = [2030, 2029, 2028, 2027, 2026].map((y) => getYmpe(y, g));
    const expected = ympes.reduce((s, n) => s + n, 0) / 5;
    expect(getAympe(2030, g)).toBeCloseTo(expected, 4);
  });
});

describe("getAyampe", () => {
  it("returns the 5-year mean of YAMPE for years where YAMPE has been published", () => {
    // For years 2022-2026 ending in 2026, YAMPE = YMPE for 2022, 2023.
    const expected =
      (getYampe(2026, 0.03) +
        getYampe(2025, 0.03) +
        getYampe(2024, 0.03) +
        getYampe(2023, 0.03) +
        getYampe(2022, 0.03)) /
      5;
    expect(getAyampe(2026, 0.03)).toBeCloseTo(expected, 4);
  });
});

describe("getMaxBenefitAt65", () => {
  it("returns published indexed maximums for in-table years", () => {
    expect(getMaxBenefitAt65(2025, 0.025)).toBe(MAX_BENEFIT_AT_65[2025]);
    expect(getMaxBenefitAt65(2026, 0.025)).toBe(1497.36);
  });

  it("projects beyond the table using the indexing rate", () => {
    // 2028 = 2026 * (1 + 0.025)^2
    expect(getMaxBenefitAt65(2028, 0.025)).toBeCloseTo(1497.36 * Math.pow(1.025, 2), 4);
  });
});

describe("getSurvivorFlatRate", () => {
  it("returns published value for in-table years", () => {
    expect(getSurvivorFlatRate(2026, 0.025)).toBe(SURVIVOR_FLAT_RATE_HISTORY[2026]);
  });

  it("projects forward using the indexing rate", () => {
    const last = SURVIVOR_FLAT_RATE_HISTORY[2026];
    expect(getSurvivorFlatRate(2028, 0.025)).toBeCloseTo(last * Math.pow(1.025, 2), 4);
  });
});

describe("getChildrensBenefit", () => {
  it("returns published value for in-table years", () => {
    expect(getChildrensBenefit(2026, 0.025)).toBe(CHILDREN_BENEFIT_HISTORY[2026]);
  });

  it("projects forward using the indexing rate", () => {
    const last = CHILDREN_BENEFIT_HISTORY[2026];
    expect(getChildrensBenefit(2030, 0.025)).toBeCloseTo(last * Math.pow(1.025, 4), 4);
  });
});
