/**
 * Per-tier breakdown of the "% of maximum CPP" metric.
 *
 * Goal: take the user-facing "% of max" number and split it into the three
 * components that make it up — Base CPP, Tier 1 enhancement, Tier 2
 * enhancement — so a planner can see exactly which slice of the maximum a
 * client is capturing from each tier.
 *
 * Definitions (all in start-year dollars at the chosen take-up age):
 *   basePct  = baseMonthly  / maxMonthlyAtStart
 *   tier1Pct = tier1Monthly / maxMonthlyAtStart
 *   tier2Pct = tier2Monthly / maxMonthlyAtStart
 *   totalPct = totalMonthly / maxMonthlyAtStart   (= percentOfMaximum)
 *
 * Invariant: basePct + tier1Pct + tier2Pct === totalPct.
 *
 * The denominator (maxMonthlyAtStart) comes from the engine's synthetic
 * max-earner pipeline (calculate.ts:553) — a hypothetical contributor with
 * the same birth year and assumptions who earns YMPE (and YAMPE post-2023)
 * every year from age 18 through the chosen take-up age. So a real max
 * earner today shows total = 100% with the three tier slices summing to 1.0.
 *
 * The shape of those three slices is the planner-relevant story: in 2026
 * the maximum is still almost entirely Base CPP; by 2070, Tier 1 and Tier 2
 * will have eaten roughly a third of the pie.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateCpp } from "../calculate";
import {
  CPP_START_YEAR,
  TIER1_START_YEAR,
  TIER2_START_YEAR,
  YMPE_HISTORY,
  getYampe,
  getYmpe,
} from "../constants";
import type { EarningsRecord, ScenarioInputs } from "../types";
import { pinYear, unpinTime } from "./_time";

beforeAll(() => pinYear(2026, 6, 15));
afterAll(() => unpinTime());

function makeInputs(over: Partial<ScenarioInputs> = {}): ScenarioInputs {
  return {
    birthYear: 1961,
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

/** YMPE/YAMPE-capped earnings from `fromAge` through the year the client turns `toAge`. */
function maxEarnerHistory(
  birthYear: number,
  fromAge: number,
  toAge: number,
  ympeGrowth: number,
  yampeGrowth: number,
): EarningsRecord[] {
  const startYear = Math.max(birthYear + fromAge, CPP_START_YEAR);
  const endYear = birthYear + toAge;
  const out: EarningsRecord[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const cap =
      y >= TIER2_START_YEAR ? getYampe(y, yampeGrowth) : getYmpe(y, ympeGrowth);
    out.push({ year: y, pensionableEarnings: cap });
  }
  return out;
}

interface TierBreakdown {
  basePct: number;
  tier1Pct: number;
  tier2Pct: number;
  totalPct: number;
  baseMonthly: number;
  tier1Monthly: number;
  tier2Monthly: number;
  totalMonthly: number;
  maxMonthlyAtStart: number;
}

function breakdownFor(inputs: ScenarioInputs, startAge: number): TierBreakdown {
  const r = calculateCpp(inputs).byStartAge.find((x) => x.startAge === startAge)!;
  return {
    basePct: r.baseMonthly / r.maxMonthlyAtStart,
    tier1Pct: r.tier1Monthly / r.maxMonthlyAtStart,
    tier2Pct: r.tier2Monthly / r.maxMonthlyAtStart,
    totalPct: r.totalMonthly / r.maxMonthlyAtStart,
    baseMonthly: r.baseMonthly,
    tier1Monthly: r.tier1Monthly,
    tier2Monthly: r.tier2Monthly,
    totalMonthly: r.totalMonthly,
    maxMonthlyAtStart: r.maxMonthlyAtStart,
  };
}

/** Round to 2 decimal places for percent display. */
const pp = (x: number) => Number((x * 100).toFixed(2));

describe("Per-tier breakdown of % of maximum CPP", () => {
  it("invariant: basePct + tier1Pct + tier2Pct === totalPct (any client)", () => {
    // Mid-career client: 25 years of YMPE 1995-2019, then nothing.
    const history: EarningsRecord[] = [];
    for (let y = 1995; y <= 2019; y++) {
      history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y]! });
    }
    const b = breakdownFor(
      makeInputs({ birthYear: 1965, startAges: [65], earningsHistory: history }),
      65,
    );
    expect(b.basePct + b.tier1Pct + b.tier2Pct).toBeCloseTo(b.totalPct, 10);
  });

  it("shape of the 2026 maximum: ~96% Base, ~3.5% Tier 1, ~0.6% Tier 2 → 100% total", () => {
    // The denominator the engine uses at age 65 in 2026 is itself the
    // synthetic max earner — so an identical max-earner client always lands
    // at exactly 100%. What's planner-relevant is HOW that 100% is split:
    // in 2026, Tier 1 has only 8 contribution years (out of 40) and Tier 2
    // has only 3, so almost the entire maximum still comes from Base CPP.
    const inputs = makeInputs({
      birthYear: 1961,
      birthMonth: 1,
      startAges: [65],
      earningsHistory: maxEarnerHistory(1961, 18, 65, 0.031, 0.031),
    });
    const b = breakdownFor(inputs, 65);

    expect(b.totalPct).toBeCloseTo(1, 6);
    expect(pp(b.basePct)).toBeCloseTo(95.81, 1);
    expect(pp(b.tier1Pct)).toBeCloseTo(3.55, 1);
    expect(pp(b.tier2Pct)).toBeCloseTo(0.64, 1);

    // Ordering: Base ≫ Tier 1 > Tier 2.
    expect(b.basePct).toBeGreaterThan(b.tier1Pct);
    expect(b.tier1Pct).toBeGreaterThan(b.tier2Pct);
  });

  it("shape of the 2070 maximum (40+ years of Tier 1 AND Tier 2): ~66% Base, ~21% Tier 1, ~12% Tier 2", () => {
    // Born 2005 → turns 65 in 2070, so Tier 1 (47 yrs, capped at 40) and
    // Tier 2 (47 yrs, capped at 40) are both fully accrued. The maximum is
    // now ~one-third enhancement, ~two-thirds Base. This is the eventual
    // structural mix once the enhancement clocks finish running.
    const inputs = makeInputs({
      birthYear: 2005,
      birthMonth: 1,
      startAges: [65],
      earningsHistory: maxEarnerHistory(2005, 18, 65, 0.031, 0.031),
    });
    const b = breakdownFor(inputs, 65);

    expect(b.totalPct).toBeCloseTo(1, 6);
    expect(pp(b.basePct)).toBeCloseTo(66.25, 1);
    expect(pp(b.tier1Pct)).toBeCloseTo(21.47, 1);
    expect(pp(b.tier2Pct)).toBeCloseTo(12.28, 1);

    // Structural ratio: Tier 1 (8.33% replacement) vs Base (25% replacement)
    // on the same YMPE band → ratio is ~1/3. Slightly less in practice
    // because Tier 1 has a small phase-in drag from 2019-2022.
    expect(b.tier1Pct / b.basePct).toBeCloseTo(0.324, 2);
  });

  it("client with NO post-2018 contributions → Tier 1 and Tier 2 are exactly 0% of max", () => {
    // Born 1953, contributed before Tier 1 (2019) and Tier 2 (2024) started.
    // The entire % of max comes from Base CPP.
    const history: EarningsRecord[] = [];
    for (let y = TIER1_START_YEAR - 30; y < TIER1_START_YEAR; y++) {
      history.push({ year: y, pensionableEarnings: YMPE_HISTORY[y]! });
    }
    const b = breakdownFor(
      makeInputs({
        birthYear: 1953,
        birthMonth: 1,
        startAges: [65],
        earningsHistory: history,
      }),
      65,
    );

    expect(b.tier1Pct).toBe(0);
    expect(b.tier2Pct).toBe(0);
    expect(b.basePct).toBeCloseTo(b.totalPct, 10);
  });

  it("late take-up (age 70) adds Tier 1 + Tier 2 contribution years → grows enhancement share", () => {
    // Same 1961 client, but works AND defers take-up to 70. Five extra
    // post-65 working years add 5 more Tier 1 years and 5 more Tier 2 years,
    // so the enhancement share of the maximum roughly doubles vs age 65.
    const inputs = makeInputs({
      birthYear: 1961,
      birthMonth: 1,
      startAges: [65, 70],
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0.025,
        futureEarningsGrowthRate: 0.02,
        assumedFutureEarnings: 0,
        stopWorkAge: 70,
      },
      earningsHistory: maxEarnerHistory(1961, 18, 70, 0.031, 0.031),
    });
    const at65 = breakdownFor(inputs, 65);
    const at70 = breakdownFor(inputs, 70);

    // Both are full max earners against their respective denominators.
    expect(at65.totalPct).toBeCloseTo(1, 6);
    expect(at70.totalPct).toBeCloseTo(1, 6);

    // Tier 1 + Tier 2 share of max grows when you keep contributing.
    expect(at70.tier1Pct).toBeGreaterThan(at65.tier1Pct);
    expect(at70.tier2Pct).toBeGreaterThan(at65.tier2Pct);
    expect(pp(at70.tier1Pct)).toBeCloseTo(6.94, 1);
    expect(pp(at70.tier2Pct)).toBeCloseTo(2.75, 1);
  });

  it("reference table: planner-facing breakdown for the synthetic 2026 max earner", () => {
    // Living reference. If the engine's max-earner shape ever shifts, this
    // test fails and someone reviews — the numbers below are quoted in the
    // white paper.
    const inputs = makeInputs({
      birthYear: 1961,
      birthMonth: 1,
      startAges: [60, 65, 70],
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0.025,
        futureEarningsGrowthRate: 0.02,
        assumedFutureEarnings: 0,
        stopWorkAge: 65,
      },
      earningsHistory: maxEarnerHistory(1961, 18, 65, 0.031, 0.031),
    });
    const table = [60, 65, 70].map((age) => {
      const b = breakdownFor(inputs, age);
      return {
        age,
        base: pp(b.basePct),
        tier1: pp(b.tier1Pct),
        tier2: pp(b.tier2Pct),
        total: pp(b.totalPct),
      };
    });

    expect(table).toEqual([
      { age: 60, base: 99.65, tier1: 0.35, tier2: 0, total: 100 },
      { age: 65, base: 95.81, tier1: 3.55, tier2: 0.64, total: 100 },
      // At 70 the client (who stopped working at 65) is no longer a true
      // max earner relative to a max-earner-to-70 denominator, so total < 100%.
      { age: 70, base: 90.3, tier1: 4.07, tier2: 1.06, total: 95.43 },
    ]);
  });
});
