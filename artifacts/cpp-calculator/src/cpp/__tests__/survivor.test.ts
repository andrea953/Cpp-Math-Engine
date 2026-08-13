/**
 * Survivor engine tests.
 *
 * Reference: Service Canada — "Canada Pension Plan survivor's, death and children's benefits"
 *  - Survivor 65+: 60% of deceased's calculated retirement (base + Tier 1)
 *  - Survivor under 65: 37.5% of deceased's calculated retirement + flat-rate component
 *  - Tier 2: 37.5% of deceased's enhanced amount, regardless of survivor age
 *  - Under-45 reduction: 1/120 per month under 45 (no children, not disabled)
 *  - Combined-benefit cap: own (base+T1) + survivor (base+T1) ≤ year's max retirement at 65
 *  - Death benefit: $2,500 lump sum since 2019
 *  - Children's benefit: indexed monthly amount per eligible child
 *
 * KNOWN LIMITATION (documented as a TODO, not a bug here):
 *   The deceased's calculated retirement uses the standard age-18-to-65
 *   contributory period. Deaths well before age 60 will under-state the
 *   pension because years between death and 65 enter the contributory
 *   period as zero-earning months. Tested via the "early death note" case.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHILDREN_BENEFIT_HISTORY,
  DEATH_BENEFIT_AMOUNT,
  DEATH_BENEFIT_TOPUP_AMOUNT,
  SURVIVOR_FLAT_RATE_HISTORY,
  SURVIVOR_RATE_65_PLUS,
  SURVIVOR_RATE_UNDER_65,
  YMPE_HISTORY,
  getMaxBenefitAt65,
} from "../constants";
import { calculateSurvivor } from "../survivor";
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
    birthYear: 1961, // turns 65 in 2026
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

describe("Survivor — deceased with no contributions", () => {
  it("returns zeros and a warning note when deceased has no earnings on file", () => {
    const inputs: ScenarioInputs = maxContributorInputs({ earningsHistory: [] });
    const r = calculateSurvivor(inputs, {
      enabled: true,
      startYear: 2026,
      survivorAge: 65,
      hasDependentChildren: false,
      survivorDisabled: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: 0,
      survivorOwnTier2Monthly: 0,
    });
    expect(r.survivorMonthlyTotal).toBe(0);
    expect(r.deathBenefit).toBe(0);
    expect(r.childrensBenefitMonthlyTotal).toBe(0);
    expect(r.notes.some((n) => /no calculated CPP retirement/i.test(n))).toBe(true);
  });
});

describe("Survivor — 65 or over", () => {
  it("receives exactly 60% of deceased base+Tier 1, no flat rate", () => {
    const r = calculateSurvivor(maxContributorInputs(), {
      enabled: true,
      startYear: 2026,
      survivorAge: 65,
      hasDependentChildren: false,
      survivorDisabled: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: 0,
      survivorOwnTier2Monthly: 0,
    });
    expect(r.survivorPensionBaseTier1).toBeCloseTo(
      r.deceasedCalculatedRetirementBaseTier1 * SURVIVOR_RATE_65_PLUS,
      4,
    );
    expect(r.survivorFlatRate).toBe(0);
    expect(r.underAgeReductionFactor).toBe(1);
  });
});

describe("Survivor — under 65 with children/disability exemption", () => {
  it("receives 37.5% of base+Tier1 + indexed flat rate, no under-45 reduction", () => {
    const r = calculateSurvivor(maxContributorInputs(), {
      enabled: true,
      startYear: 2026,
      survivorAge: 50,
      hasDependentChildren: true,
      survivorDisabled: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: 0,
      survivorOwnTier2Monthly: 0,
    });
    expect(r.survivorPensionBaseTier1).toBeCloseTo(
      r.deceasedCalculatedRetirementBaseTier1 * SURVIVOR_RATE_UNDER_65,
      4,
    );
    expect(r.survivorFlatRate).toBeCloseTo(SURVIVOR_FLAT_RATE_HISTORY[2026], 4);
    expect(r.underAgeReductionFactor).toBe(1);
  });
});

describe("Survivor — under-45 reduction (no children, not disabled)", () => {
  it("applies 1/120-per-month reduction for ages 35-44", () => {
    const r = calculateSurvivor(maxContributorInputs(), {
      enabled: true,
      startYear: 2026,
      survivorAge: 40,
      hasDependentChildren: false,
      survivorDisabled: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: 0,
      survivorOwnTier2Monthly: 0,
    });
    // 40 years old: 5 years = 60 months under 45 → factor = 1 - 60/120 = 0.5
    expect(r.underAgeReductionFactor).toBeCloseTo(0.5, 6);
    expect(r.survivorPensionBaseTier1).toBeCloseTo(
      r.deceasedCalculatedRetirementBaseTier1 * SURVIVOR_RATE_UNDER_65 * 0.5,
      4,
    );
    expect(r.survivorFlatRate).toBeCloseTo(SURVIVOR_FLAT_RATE_HISTORY[2026] * 0.5, 4);
  });

  it("returns zero pension for survivors under 35 with no children/disability", () => {
    const r = calculateSurvivor(maxContributorInputs(), {
      enabled: true,
      startYear: 2026,
      survivorAge: 30,
      hasDependentChildren: false,
      survivorDisabled: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: 0,
      survivorOwnTier2Monthly: 0,
    });
    expect(r.underAgeReductionFactor).toBe(0);
    expect(r.survivorMonthlyTotal).toBe(0);
    expect(r.notes.some((n) => /no survivor pension is payable until age 65/i.test(n))).toBe(true);
  });
});

describe("Survivor — Tier 2 portion", () => {
  it("is always 37.5% of deceased's Tier 2 regardless of survivor age 65+", () => {
    const inputs = maxContributorInputs({
      earningsHistory: [
        ...maxContributorInputs().earningsHistory,
        { year: 2024, pensionableEarnings: 73200 },
        { year: 2025, pensionableEarnings: 81200 },
      ],
    });
    const at65 = calculateSurvivor(inputs, {
      enabled: true,
      startYear: 2026,
      survivorAge: 65,
      hasDependentChildren: false,
      survivorDisabled: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: 0,
      survivorOwnTier2Monthly: 0,
    });
    expect(at65.survivorPensionTier2).toBeCloseTo(
      at65.deceasedCalculatedRetirementTier2 * 0.375,
      4,
    );
  });
});

describe("Survivor — combined-benefit cap", () => {
  it("clawbacks the survivor base+Tier 1 when own retirement + survivor would exceed the year's max", () => {
    const ownBaseTier1 = getMaxBenefitAt65(2026, 0.025) - 100; // leave only $100 of cap available
    const r = calculateSurvivor(maxContributorInputs(), {
      enabled: true,
      startYear: 2026,
      survivorAge: 65,
      hasDependentChildren: false,
      survivorDisabled: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: ownBaseTier1,
      survivorOwnTier2Monthly: 0,
    });
    expect(r.survivorPensionBaseTier1AfterCap).toBeLessThanOrEqual(100 + 0.001);
    expect(r.combinedCapReduction).toBeGreaterThan(0);
    expect(r.notes.some((n) => /combined-benefit cap/i.test(n))).toBe(true);
  });

  it("does not clawback when own + survivor is under the cap", () => {
    const r = calculateSurvivor(maxContributorInputs(), {
      enabled: true,
      startYear: 2026,
      survivorAge: 65,
      hasDependentChildren: false,
      survivorDisabled: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: 200,
      survivorOwnTier2Monthly: 0,
    });
    expect(r.combinedCapReduction).toBe(0);
    expect(r.survivorPensionBaseTier1AfterCap).toBeCloseTo(r.survivorPensionBaseTier1, 4);
  });
});

describe("Survivor — death and children's benefits", () => {
  it("death benefit is the $2,500 basic amount when a survivor pension is payable", () => {
    const r = calculateSurvivor(maxContributorInputs(), {
      enabled: true,
      startYear: 2026,
      survivorAge: 65,
      hasDependentChildren: false,
      survivorDisabled: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: 0,
      survivorOwnTier2Monthly: 0,
    });
    expect(r.deathBenefit).toBe(DEATH_BENEFIT_AMOUNT);
    expect(r.deathBenefitBasic).toBe(DEATH_BENEFIT_AMOUNT);
    expect(r.deathBenefitTopUp).toBe(0);
  });

  it("adds the $2,500 top-up (max $5,000) for 2025+ deaths before age 60 with no pension-eligible survivor", () => {
    // Deceased born 1985 dies in 2026 at age 41 (never able to start CPP);
    // survivor is 30 with no children and not disabled — not eligible for a
    // survivor's pension.
    const history = [];
    for (let y = 2005; y <= 2025; y++) {
      history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y] ?? 0 });
    }
    const r = calculateSurvivor(
      maxContributorInputs({ birthYear: 1985, earningsHistory: history }),
      {
        enabled: true,
        startYear: 2026,
        survivorAge: 30,
        hasDependentChildren: false,
        survivorDisabled: false,
        numEligibleChildren: 0,
        survivorOwnBaseTier1Monthly: 0,
        survivorOwnTier2Monthly: 0,
      },
    );
    expect(r.deathBenefitBasic).toBe(DEATH_BENEFIT_AMOUNT);
    expect(r.deathBenefitTopUp).toBe(DEATH_BENEFIT_TOPUP_AMOUNT);
    expect(r.deathBenefit).toBe(5000);
    expect(r.notes.join(" ")).toMatch(/top-up/i);
  });

  it("no top-up at 60+ when receipt status is unknown (conservative, with a conditional note)", () => {
    const r = calculateSurvivor(maxContributorInputs(), {
      enabled: true,
      startYear: 2026,
      survivorAge: 30,
      hasDependentChildren: false,
      survivorDisabled: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: 0,
      survivorOwnTier2Monthly: 0,
    });
    expect(r.deathBenefitTopUp).toBe(0);
    expect(r.deathBenefit).toBe(DEATH_BENEFIT_AMOUNT);
    expect(r.notes.join(" ")).toMatch(/top-up.*may apply/i);
  });

  it("top-up applies at 60+ when explicitly marked as never having received CPP/QPP benefits", () => {
    const r = calculateSurvivor(maxContributorInputs(), {
      enabled: true,
      startYear: 2026,
      survivorAge: 30,
      hasDependentChildren: false,
      survivorDisabled: false,
      deceasedReceivedCppBenefits: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: 0,
      survivorOwnTier2Monthly: 0,
    });
    expect(r.deathBenefitTopUp).toBe(DEATH_BENEFIT_TOPUP_AMOUNT);
    expect(r.deathBenefit).toBe(5000);
  });

  it("no top-up when the deceased received CPP/QPP benefits, even for deaths before 60", () => {
    const history = [];
    for (let y = 2005; y <= 2025; y++) {
      history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y] ?? 0 });
    }
    const r = calculateSurvivor(
      maxContributorInputs({ birthYear: 1985, earningsHistory: history }),
      {
        enabled: true,
        startYear: 2026,
        survivorAge: 30,
        hasDependentChildren: false,
        survivorDisabled: false,
        deceasedReceivedCppBenefits: true, // e.g. CPP disability
        numEligibleChildren: 0,
        survivorOwnBaseTier1Monthly: 0,
        survivorOwnTier2Monthly: 0,
      },
    );
    expect(r.deathBenefitTopUp).toBe(0);
    expect(r.deathBenefit).toBe(DEATH_BENEFIT_AMOUNT);
  });

  it("no top-up for deaths before 2025", () => {
    const history = [];
    for (let y = 2005; y <= 2023; y++) {
      history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y] ?? 0 });
    }
    const r = calculateSurvivor(
      maxContributorInputs({ birthYear: 1985, earningsHistory: history }),
      {
        enabled: true,
        startYear: 2024,
        survivorAge: 30,
        hasDependentChildren: false,
        survivorDisabled: false,
        deceasedReceivedCppBenefits: false,
        numEligibleChildren: 0,
        survivorOwnBaseTier1Monthly: 0,
        survivorOwnTier2Monthly: 0,
      },
    );
    expect(r.deathBenefitTopUp).toBe(0);
    expect(r.deathBenefit).toBe(DEATH_BENEFIT_AMOUNT);
  });

  it("no top-up when a spouse is eligible for a survivor's pension", () => {
    const history = [];
    for (let y = 2005; y <= 2025; y++) {
      history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y] ?? 0 });
    }
    const r = calculateSurvivor(
      maxContributorInputs({ birthYear: 1985, earningsHistory: history }),
      {
        enabled: true,
        startYear: 2026,
        survivorAge: 45, // eligible for survivor's pension
        hasDependentChildren: false,
        survivorDisabled: false,
        deceasedReceivedCppBenefits: false,
        numEligibleChildren: 0,
        survivorOwnBaseTier1Monthly: 0,
        survivorOwnTier2Monthly: 0,
      },
    );
    expect(r.deathBenefitTopUp).toBe(0);
    expect(r.deathBenefit).toBe(DEATH_BENEFIT_AMOUNT);
  });

  it("children's benefit equals per-child × number of eligible children", () => {
    const r = calculateSurvivor(maxContributorInputs(), {
      enabled: true,
      startYear: 2026,
      survivorAge: 45,
      hasDependentChildren: true,
      survivorDisabled: false,
      numEligibleChildren: 3,
      survivorOwnBaseTier1Monthly: 0,
      survivorOwnTier2Monthly: 0,
    });
    expect(r.childrensBenefitPerChild).toBe(CHILDREN_BENEFIT_HISTORY[2026]);
    expect(r.childrensBenefitMonthlyTotal).toBeCloseTo(CHILDREN_BENEFIT_HISTORY[2026] * 3, 4);
  });
});

describe("Survivor — early-death contributory-period limitation (documented)", () => {
  it("attaches a note when death age is under 60", () => {
    // Person born 1980, dies in 2026 at age 46
    const inputs: ScenarioInputs = {
      birthYear: 1980,
      birthMonth: 1,
      earningsHistory: Array.from({ length: 10 }, (_, i) => ({
        year: 2010 + i,
        pensionableEarnings: YMPE_HISTORY[2010 + i] ?? 50000,
      })),
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0.025,
        futureEarningsGrowthRate: 0.02,
        assumedFutureEarnings: 0,
        stopWorkAge: 65,
      },
      startAges: [65],
    };
    const r = calculateSurvivor(inputs, {
      enabled: true,
      startYear: 2026,
      survivorAge: 50,
      hasDependentChildren: true,
      survivorDisabled: false,
      numEligibleChildren: 0,
      survivorOwnBaseTier1Monthly: 0,
      survivorOwnTier2Monthly: 0,
    });
    expect(r.notes.some((n) => /contributory-period model extends to age 65/i.test(n))).toBe(true);
  });
});
