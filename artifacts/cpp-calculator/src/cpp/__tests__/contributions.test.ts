/**
 * Annual contribution amount tests.
 *
 * References (CRA — "CPP contribution rates, maximums and exemptions"):
 *   2024: YMPE 68,500 · YAMPE 73,200 · employee base 4.95% · CPP1 1% · CPP2 4%
 *
 * The 2024 figures are used as the audit-grade reference because they are the
 * first year that exercises every contribution band (base + Tier 1 + Tier 2).
 *
 * For 2024, an employee earning the YMPE pays:
 *   Base   = (68,500 - 3,500) * 4.95% = 65,000 * 0.0495 = $3,217.50
 *   Tier 1 = 65,000 * 1.00%           = $650.00
 *   Tier 2 = 0 (earnings == YMPE)     = $0.00
 *   Total                              = $3,867.50
 * Self-employed pays 2× = $7,735.00.
 *
 * For 2024, an employee earning above YAMPE pays:
 *   Base   = $3,217.50
 *   Tier 1 = $650.00
 *   Tier 2 = (73,200 - 68,500) * 4% = 4,700 * 0.04 = $188.00
 *   Total  = $4,055.50
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateAnnualContribution } from "../contributions";
import { pinYear, unpinTime } from "./_time";

beforeAll(() => pinYear(2026, 6, 15));
afterAll(() => unpinTime());

describe("calculateAnnualContribution — 2024 employee at YMPE", () => {
  const result = calculateAnnualContribution(2024, 68_500, false);

  it("matches CRA published base contribution to the cent", () => {
    expect(result.baseContribution).toBeCloseTo(3217.5, 2);
  });

  it("matches CRA published Tier 1 (CPP1) contribution to the cent", () => {
    expect(result.tier1Contribution).toBeCloseTo(650.0, 2);
  });

  it("has zero Tier 2 because earnings == YMPE", () => {
    expect(result.tier2Contribution).toBeCloseTo(0, 2);
    expect(result.tier2BandEarnings).toBe(0);
  });

  it("totals 3867.50 for an employee", () => {
    expect(result.totalContribution).toBeCloseTo(3867.5, 2);
  });

  it("reports the opposite-status total (self-employed = 2x)", () => {
    expect(result.totalContributionAtOppositeStatus).toBeCloseTo(7735.0, 2);
  });
});

describe("calculateAnnualContribution — 2024 self-employed at YMPE", () => {
  const result = calculateAnnualContribution(2024, 68_500, true);

  it("doubles every component", () => {
    expect(result.baseContribution).toBeCloseTo(3217.5 * 2, 2);
    expect(result.tier1Contribution).toBeCloseTo(650.0 * 2, 2);
    expect(result.totalContribution).toBeCloseTo(3867.5 * 2, 2);
  });

  it("reports the opposite-status total (employee = 0.5x)", () => {
    expect(result.totalContributionAtOppositeStatus).toBeCloseTo(3867.5, 2);
  });
});

describe("calculateAnnualContribution — 2024 high earner above YAMPE", () => {
  it("captures Tier 2 on the YMPE→YAMPE band only", () => {
    const result = calculateAnnualContribution(2024, 100_000, false);
    expect(result.pensionableEarnings).toBe(73_200); // capped at YAMPE
    expect(result.tier2BandEarnings).toBe(4_700);
    expect(result.tier2Contribution).toBeCloseTo(188.0, 2);
    expect(result.totalContribution).toBeCloseTo(4055.5, 2);
  });

  it("doubles the Tier 2 amount when self-employed", () => {
    const employee = calculateAnnualContribution(2024, 100_000, false);
    const selfEmployed = calculateAnnualContribution(2024, 100_000, true);
    expect(selfEmployed.totalContribution).toBeCloseTo(employee.totalContribution * 2, 2);
  });
});

describe("calculateAnnualContribution — pre-2019 (no Tier 1) and pre-2024 (no Tier 2)", () => {
  it("has no Tier 1 contribution before 2019", () => {
    const result = calculateAnnualContribution(2018, 50_000, false);
    expect(result.tier1Contribution).toBe(0);
  });

  it("has no Tier 2 contribution before 2024", () => {
    const result = calculateAnnualContribution(2023, 100_000, false);
    expect(result.tier2Contribution).toBe(0);
    expect(result.tier2BandEarnings).toBe(0);
  });

  it("phases in Tier 1 at the published rate (2020 = 0.30%)", () => {
    const result = calculateAnnualContribution(2020, 60_000, false);
    // Earnings (60,000) capped at YMPE 2020 = 58,700. Band = 58,700 - 3,500 = 55,200.
    expect(result.baseBandEarnings).toBe(55_200);
    expect(result.tier1Contribution).toBeCloseTo(55_200 * 0.003, 2);
  });
});

describe("calculateAnnualContribution — earnings below YBE", () => {
  it("returns zero contribution when earnings <= YBE", () => {
    const result = calculateAnnualContribution(2024, 3_500, false);
    expect(result.totalContribution).toBe(0);
    expect(result.baseBandEarnings).toBe(0);
  });

  it("applies base contribution only on the slice above YBE", () => {
    const result = calculateAnnualContribution(2024, 10_000, false);
    expect(result.baseBandEarnings).toBe(6_500); // 10,000 - 3,500
    expect(result.baseContribution).toBeCloseTo(6_500 * 0.0495, 2);
  });
});

describe("calculateAnnualContribution — biweekly equivalent", () => {
  it("divides total contribution by 26", () => {
    const result = calculateAnnualContribution(2024, 68_500, false);
    expect(result.biweeklyContribution).toBeCloseTo(3867.5 / 26, 2);
  });
});

describe("calculateAnnualContribution — self-employment doubles total but never exceeds the legal opposite-status delta", () => {
  it("self-employed total = 2x employee total at every earnings level", () => {
    for (const earnings of [20_000, 50_000, 68_500, 100_000]) {
      const employee = calculateAnnualContribution(2024, earnings, false);
      const selfEmployed = calculateAnnualContribution(2024, earnings, true);
      expect(selfEmployed.totalContribution).toBeCloseTo(employee.totalContribution * 2, 6);
    }
  });
});
