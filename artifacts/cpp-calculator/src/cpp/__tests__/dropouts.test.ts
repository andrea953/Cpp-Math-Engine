/**
 * Drop-out tests.
 *
 * Reference: Service Canada — "Drop-out provisions"
 *  - Child Rearing Drop-Out (CRDO): months while caring for a child under 7
 *    are removed from the contributory period.
 *  - Disability drop-out: months receiving CPP-D are removed from the
 *    contributory period (separate from CRDO).
 *  - General drop-out: lowest 17% of remaining months are dropped from the
 *    AMPE calculation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateCpp } from "../calculate";
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
      indexingRate: 0.025,
      futureEarningsGrowthRate: 0.02,
      assumedFutureEarnings: 0,
      stopWorkAge: 65,
    },
    startAges: [65],
    ...over,
  };
}

/** makeInputs with the listed calendar years forced to zero pensionable earnings. */
function zeroOut(over: Partial<ScenarioInputs>, years: number[]): ScenarioInputs {
  const inputs = makeInputs(over);
  const zero = new Set(years);
  return {
    ...inputs,
    earningsHistory: inputs.earningsHistory.map((r) =>
      zero.has(r.year) ? { ...r, pensionableEarnings: 0 } : r,
    ),
  };
}

/** makeInputs with the given {year: pensionableEarnings} overrides applied. */
function setEarnings(
  over: Partial<ScenarioInputs>,
  yearValues: Record<number, number>,
): ScenarioInputs {
  const inputs = makeInputs(over);
  const map = new Map(Object.entries(yearValues).map(([y, v]) => [Number(y), v]));
  return {
    ...inputs,
    earningsHistory: inputs.earningsHistory.map((r) =>
      map.has(r.year) ? { ...r, pensionableEarnings: map.get(r.year)! } : r,
    ),
  };
}

describe("CRDO (Child Rearing Drop-Out) — beneficial-only", () => {
  it("drops below-average (zero-earning) child-rearing months", () => {
    // A parent with a long zero-earning stretch (1990-2009) — longer than the
    // general 17% drop-out can absorb — so remaining zero months still drag down
    // the average. Marking Jan 1990 - Dec 1992 (36 months) as CRDO removes those
    // zero months *before* the general drop-out, lifting the benefit further.
    const gapYears = Array.from({ length: 20 }, (_, i) => 1990 + i); // 1990..2009
    const baseline = calculateCpp(zeroOut({}, gapYears)).byStartAge[0];
    const withCrdo = calculateCpp(
      zeroOut(
        {
          dropoutPeriods: [
            { kind: "crdo", startYear: 1990, startMonth: 1, endYear: 1992, endMonth: 12 },
          ],
        },
        gapYears,
      ),
    ).byStartAge[0];

    expect(withCrdo.base.crdoMonthsDropped).toBe(36);
    // The CRDO claim raises the base benefit (removing the zero months).
    expect(withCrdo.baseMonthly).toBeGreaterThan(baseline.baseMonthly);

    // contributoryPeriodMonths is the TOTAL window size (age 18 → start month).
    // CRDO removes months from the AMPE calculation but does not shrink that
    // window — it surfaces in `generalDropoutMonths` and `monthsRetained` instead.
    expect(withCrdo.base.contributoryPeriodMonths).toBe(baseline.base.contributoryPeriodMonths);

    // Engine accounting identity (per `calculateBase`):
    //   afterSpecial = contributoryPeriodMonths - crdoMonthsDropped - disabilityMonthsDropped
    //   generalDropoutMonths = floor(afterSpecial × 0.17)
    //   monthsRetained = afterSpecial - generalDropoutMonths
    const afterSpecial =
      withCrdo.base.contributoryPeriodMonths -
      withCrdo.base.crdoMonthsDropped -
      withCrdo.base.disabilityMonthsDropped;
    expect(withCrdo.base.generalDropoutMonths).toBe(Math.floor(afterSpecial * 0.17));
    expect(withCrdo.base.monthsRetained).toBe(afterSpecial - withCrdo.base.generalDropoutMonths);
  });

  it("keeps above-average child-rearing months (a CRDO claim never lowers the benefit)", () => {
    // Same window, but the parent actually earned YMPE-max throughout it. Those
    // months are at the ceiling, so dropping them would LOWER the average — the
    // engine keeps them and drops nothing.
    const baseline = calculateCpp(makeInputs()).byStartAge[0];
    const withCrdo = calculateCpp(
      makeInputs({
        dropoutPeriods: [
          { kind: "crdo", startYear: 1990, startMonth: 1, endYear: 1992, endMonth: 12 },
        ],
      }),
    ).byStartAge[0];

    expect(withCrdo.base.crdoMonthsDropped).toBe(0);
    expect(withCrdo.baseMonthly).toBeCloseTo(baseline.baseMonthly, 6);
  });
});

describe("Disability drop-out", () => {
  it("does not double-count months that overlap with CRDO", () => {
    const result = calculateCpp(
      zeroOut(
        {
          dropoutPeriods: [
            // Same 24 zero-earning months marked as both CRDO and disability
            { kind: "crdo", startYear: 1990, startMonth: 1, endYear: 1991, endMonth: 12 },
            { kind: "disability", startYear: 1990, startMonth: 1, endYear: 1991, endMonth: 12 },
          ],
        },
        [1990, 1991],
      ),
    ).byStartAge[0];

    // CRDO claims the months; disabilityMonthsDropped should only count
    // months that are NOT also in CRDO (i.e. zero here).
    expect(result.base.crdoMonthsDropped).toBe(24);
    expect(result.base.disabilityMonthsDropped).toBe(0);
  });

  it("counts disability months that don't overlap CRDO", () => {
    const result = calculateCpp(
      zeroOut(
        {
          dropoutPeriods: [
            { kind: "crdo", startYear: 1990, startMonth: 1, endYear: 1990, endMonth: 12 },
            { kind: "disability", startYear: 1995, startMonth: 1, endYear: 1995, endMonth: 6 },
          ],
        },
        [1990],
      ),
    ).byStartAge[0];
    expect(result.base.crdoMonthsDropped).toBe(12);
    expect(result.base.disabilityMonthsDropped).toBe(6);
  });
});

describe("Child-rearing drop-in (Enhanced CPP)", () => {
  // The enhancement loops run for years >= 2019 (Tier 1) up to the start year.
  // For a 1961-born retiring at 65 (start 2026) the Tier 1 window is 2019..2025.
  it("imputes income for child-rearing years from the 5 prior years' average", () => {
    // Zero earnings 2020-2022 (child-rearing gap inside the enhancement era);
    // the 5 prior years (2015-2019) are at YMPE-max, so imputed income is high.
    const gapYears = [2020, 2021, 2022];
    const withoutClaim = calculateCpp(zeroOut({}, gapYears)).byStartAge[0];
    const withClaim = calculateCpp(
      zeroOut(
        {
          dropoutPeriods: [
            { kind: "crdo", startYear: 2020, startMonth: 1, endYear: 2022, endMonth: 12 },
          ],
        },
        gapYears,
      ),
    ).byStartAge[0];

    // All three zero-earning years get imputed income dropped in.
    expect(withClaim.enhancement.tier1DropInYears).toBe(3);
    // The drop-in raises the Tier 1 enhancement benefit.
    expect(withClaim.tier1Monthly).toBeGreaterThan(withoutClaim.tier1Monthly);

    // Diagnostics expose the imputed amount for each protected year.
    expect(withClaim.enhancement.dropInAmountsByYear.map((d) => d.year)).toEqual([
      2020, 2021, 2022,
    ]);
    for (const d of withClaim.enhancement.dropInAmountsByYear) {
      expect(d.amount).toBeGreaterThan(0);
    }
    // All three years share the same imputed value (avg of the 5 prior years).
    const amounts = withClaim.enhancement.dropInAmountsByYear.map((d) => d.amount);
    expect(new Set(amounts).size).toBe(1);
    // No claim -> no drop-in diagnostics.
    expect(withoutClaim.enhancement.dropInAmountsByYear).toEqual([]);

    // Applied-credit diagnostics: all three years were actually credited.
    expect(withClaim.enhancement.appliedCaregivingDropIns.map((d) => d.year)).toEqual([
      2020, 2021, 2022,
    ]);
    expect(withoutClaim.enhancement.appliedCaregivingDropIns).toEqual([]);
  });

  it("does not report an applied caregiving credit when real earnings already exceed the imputed amount", () => {
    // Earnings stay at YMPE-max during the CRDO window, so imputed (avg of the
    // 5 prior YMPE-max years, i.e. below the window's own YMPE) never beats
    // real earnings: candidate amounts exist but no credit is applied.
    const withClaim = calculateCpp(
      makeInputs({
        dropoutPeriods: [
          { kind: "crdo", startYear: 2020, startMonth: 1, endYear: 2022, endMonth: 12 },
        ],
      }),
    ).byStartAge[0];
    expect(withClaim.enhancement.dropInAmountsByYear.length).toBeGreaterThan(0);
    expect(withClaim.enhancement.tier1DropInYears).toBe(0);
    expect(withClaim.enhancement.appliedCaregivingDropIns).toEqual([]);
  });

  it("excludes protected years at or after the selected start year from applied credits", () => {
    // Start at 60 (start year 2021): only 2020 precedes the start year, so
    // 2021-2022 candidates must not be reported as applied for that result.
    const result = calculateCpp(
      zeroOut(
        {
          startAges: [60, 65],
          dropoutPeriods: [
            { kind: "crdo", startYear: 2020, startMonth: 1, endYear: 2022, endMonth: 12 },
          ],
        },
        [2020, 2021, 2022],
      ),
    );
    const at60 = result.byStartAge.find((r) => r.startAge === 60)!;
    const at65 = result.byStartAge.find((r) => r.startAge === 65)!;
    expect(at60.enhancement.appliedCaregivingDropIns.map((d) => d.year)).toEqual([2020]);
    expect(at65.enhancement.appliedCaregivingDropIns.map((d) => d.year)).toEqual([
      2020, 2021, 2022,
    ]);
  });

  it("keeps disability drop-ins out of the applied caregiving credits", () => {
    const withClaim = calculateCpp(
      zeroOut(
        {
          dropoutPeriods: [
            { kind: "disability", startYear: 2020, startMonth: 1, endYear: 2022, endMonth: 12 },
          ],
        },
        [2020, 2021, 2022],
      ),
    ).byStartAge[0];
    expect(withClaim.enhancement.tier1DropInYears).toBe(3);
    expect(withClaim.enhancement.appliedCaregivingDropIns).toEqual([]);
  });

  it("produces no imputed income when there were no earnings in the 5 years before birth", () => {
    // Zero the gap AND the 5 prior years (2015-2022). With no prior earnings
    // there is no imputed income, so the drop-in does not fire (Figure 2 of the
    // source paper).
    const deadYears = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022];
    const withClaim = calculateCpp(
      zeroOut(
        {
          dropoutPeriods: [
            { kind: "crdo", startYear: 2020, startMonth: 1, endYear: 2022, endMonth: 12 },
          ],
        },
        deadYears,
      ),
    ).byStartAge[0];
    expect(withClaim.enhancement.tier1DropInYears).toBe(0);
  });

  // Tier 2 only accrues on earnings in the YMPE -> YAMPE band (years >= 2024).
  // The 1961-born / start-2026 harness has a Tier 2 window of 2024..2025, so we
  // set above-YMPE earnings (here 100,000) in the 5 prior years to exercise it.
  it("imputes above-YMPE income for Tier 2 child-rearing years", () => {
    const overrides = {
      2019: 100000,
      2020: 100000,
      2021: 100000,
      2022: 100000,
      2023: 100000, // 5 prior years, above YMPE -> imputed income lands in Tier 2 band
      2024: 0,
      2025: 0, // child-rearing gap inside the Tier 2 era
    };
    const withoutClaim = calculateCpp(setEarnings({}, overrides)).byStartAge[0];
    const withClaim = calculateCpp(
      setEarnings(
        {
          dropoutPeriods: [
            { kind: "crdo", startYear: 2024, startMonth: 1, endYear: 2025, endMonth: 12 },
          ],
        },
        overrides,
      ),
    ).byStartAge[0];

    // Both 2024 and 2025 get imputed income above YMPE.
    expect(withClaim.enhancement.tier2DropInYears).toBe(2);
    // Without the claim there is no Tier 2 accrual at all (gap years are zero).
    expect(withoutClaim.tier2Monthly).toBe(0);
    expect(withClaim.tier2Monthly).toBeGreaterThan(0);
  });

  it("produces no Tier 2 imputed income when the 5 prior years had no earnings", () => {
    const overrides = {
      2019: 0,
      2020: 0,
      2021: 0,
      2022: 0,
      2023: 0,
      2024: 0,
      2025: 0,
    };
    const withClaim = calculateCpp(
      setEarnings(
        {
          dropoutPeriods: [
            { kind: "crdo", startYear: 2024, startMonth: 1, endYear: 2025, endMonth: 12 },
          ],
        },
        overrides,
      ),
    ).byStartAge[0];
    expect(withClaim.enhancement.tier2DropInYears).toBe(0);
    expect(withClaim.tier2Monthly).toBe(0);
  });

  it("uses the higher imputed income across overlapping child-rearing windows", () => {
    const overrides = {
      2019: 100000,
      2020: 100000,
      2021: 100000,
      2022: 100000,
      2023: 100000,
      2024: 0,
      2025: 0,
    };
    // Window A (birth 2024) imputes the high 2019-2023 average across 2024-2025.
    const single = calculateCpp(
      setEarnings(
        {
          dropoutPeriods: [
            { kind: "crdo", startYear: 2024, startMonth: 1, endYear: 2025, endMonth: 12 },
          ],
        },
        overrides,
      ),
    ).byStartAge[0];
    // Adding a second window (birth 2025) that overlaps 2025 with a LOWER imputed
    // average must not reduce the benefit — the engine keeps the higher value.
    const overlapping = calculateCpp(
      setEarnings(
        {
          dropoutPeriods: [
            { kind: "crdo", startYear: 2024, startMonth: 1, endYear: 2025, endMonth: 12 },
            { kind: "crdo", startYear: 2025, startMonth: 1, endYear: 2025, endMonth: 12 },
          ],
        },
        overrides,
      ),
    ).byStartAge[0];

    expect(overlapping.enhancement.tier2DropInYears).toBe(2);
    expect(overlapping.tier2Monthly).toBeCloseTo(single.tier2Monthly, 6);
  });
});

describe("Disability drop-in (Enhanced CPP)", () => {
  // canada.ca CPP amount, "Periods of disability": the enhanced component credits
  // 70% of the average earnings in the 6 years before disability onset. Tier 1
  // window for the 1961-born / start-2026 harness is 2019..2025.
  it("imputes 70% of the 6 prior years' average for disability years (Tier 1)", () => {
    // Disability gap 2020-2022; the 6 prior years (2014-2019) are at YMPE-max.
    const gapYears = [2020, 2021, 2022];
    const withoutClaim = calculateCpp(zeroOut({}, gapYears)).byStartAge[0];
    const withClaim = calculateCpp(
      zeroOut(
        {
          dropoutPeriods: [
            { kind: "disability", startYear: 2020, startMonth: 1, endYear: 2022, endMonth: 12 },
          ],
        },
        gapYears,
      ),
    ).byStartAge[0];

    // All three zero-earning disability years get imputed income dropped in.
    expect(withClaim.enhancement.tier1DropInYears).toBe(3);
    expect(withClaim.tier1Monthly).toBeGreaterThan(withoutClaim.tier1Monthly);
  });

  it("produces no imputed income when the 6 years before onset had no earnings", () => {
    const deadYears = [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022];
    const withClaim = calculateCpp(
      zeroOut(
        {
          dropoutPeriods: [
            { kind: "disability", startYear: 2020, startMonth: 1, endYear: 2022, endMonth: 12 },
          ],
        },
        deadYears,
      ),
    ).byStartAge[0];
    expect(withClaim.enhancement.tier1DropInYears).toBe(0);
  });

  it("imputes above-YMPE income for Tier 2 disability years", () => {
    // Prior earnings are high enough that 70% of the average still clears YMPE in
    // both 2024 and 2025, so the imputed income lands in the Tier 2 band.
    const overrides = {
      2018: 150000,
      2019: 150000,
      2020: 150000,
      2021: 150000,
      2022: 150000,
      2023: 150000, // 6 prior years (2018-2023); 70% avg = 105,000 > YMPE
      2024: 0,
      2025: 0, // disability gap inside the Tier 2 era
    };
    const withoutClaim = calculateCpp(setEarnings({}, overrides)).byStartAge[0];
    const withClaim = calculateCpp(
      setEarnings(
        {
          dropoutPeriods: [
            { kind: "disability", startYear: 2024, startMonth: 1, endYear: 2025, endMonth: 12 },
          ],
        },
        overrides,
      ),
    ).byStartAge[0];

    expect(withClaim.enhancement.tier2DropInYears).toBe(2);
    expect(withoutClaim.tier2Monthly).toBe(0);
    expect(withClaim.tier2Monthly).toBeGreaterThan(0);
  });

  it("credits less than the child-rearing drop-in for the same window (70% vs 100%)", () => {
    // Flat prior earnings so the 5-year (CRDO) and 6-year (disability) averages
    // are identical; the only difference is the 70% disability factor. The gap
    // years (2020-2022) are zero so the drop-in is the sole contribution there.
    const flat = 40000;
    const overrides: Record<number, number> = {};
    for (let y = 2013; y <= 2025; y++) overrides[y] = flat;
    for (const y of [2020, 2021, 2022]) overrides[y] = 0;

    const crdo = calculateCpp(
      setEarnings(
        {
          dropoutPeriods: [
            { kind: "crdo", startYear: 2020, startMonth: 1, endYear: 2022, endMonth: 12 },
          ],
        },
        overrides,
      ),
    ).byStartAge[0];
    const disability = calculateCpp(
      setEarnings(
        {
          dropoutPeriods: [
            { kind: "disability", startYear: 2020, startMonth: 1, endYear: 2022, endMonth: 12 },
          ],
        },
        overrides,
      ),
    ).byStartAge[0];

    expect(disability.enhancement.tier1DropInYears).toBe(3);
    expect(crdo.enhancement.tier1DropInYears).toBe(3);
    // Same window + flat prior earnings -> disability credits 70% of what CRDO
    // does, so its Tier 1 enhancement is strictly lower (but still positive).
    expect(disability.tier1Monthly).toBeGreaterThan(0);
    expect(disability.tier1Monthly).toBeLessThan(crdo.tier1Monthly);
  });

  it("applies the drop-in at annual granularity (partial-year window credits the whole year)", () => {
    // The enhanced component is computed from annual pensionable earnings, so a
    // partial-year disability window (Jul-Dec 2020 + Jan-Jun 2021) imputes income
    // for both calendar years it touches — start/end months are not prorated.
    const gapYears = [2020, 2021];
    const withClaim = calculateCpp(
      zeroOut(
        {
          dropoutPeriods: [
            { kind: "disability", startYear: 2020, startMonth: 7, endYear: 2021, endMonth: 6 },
          ],
        },
        gapYears,
      ),
    ).byStartAge[0];
    expect(withClaim.enhancement.tier1DropInYears).toBe(2);
  });
});

describe("General 17% drop-out", () => {
  it("drops floor(17% × contributory period) months from the lowest indexed earnings", () => {
    const result = calculateCpp(makeInputs()).byStartAge[0];
    // After post-65 drop-out (zero here at start age 65), the 17% applies to
    // contributoryPeriodMonths - crdo - disability - post65.
    const afterAllSpecial =
      result.base.contributoryPeriodMonths -
      result.base.crdoMonthsDropped -
      result.base.disabilityMonthsDropped -
      result.base.post65DropoutMonths;
    const expected = Math.floor(afterAllSpecial * 0.17);
    expect(result.base.generalDropoutMonths).toBe(expected);
  });

  it("drops the lowest-earning months: a single zero year does not move the AMPE much", () => {
    // Already covered numerically in baseCpp.test.ts; here we add the
    // diagnostic-level check that the dropped-month count equals 17% of
    // remaining months regardless of where the zeros sit.
    const inputs = makeInputs({
      earningsHistory: makeInputs().earningsHistory.map((r) =>
        r.year === 2010 ? { ...r, pensionableEarnings: 0 } : r,
      ),
    });
    const r = calculateCpp(inputs).byStartAge[0];
    const afterAllSpecial =
      r.base.contributoryPeriodMonths -
      r.base.crdoMonthsDropped -
      r.base.disabilityMonthsDropped -
      r.base.post65DropoutMonths;
    expect(r.base.generalDropoutMonths).toBe(Math.floor(afterAllSpecial * 0.17));
  });
});

describe("Post-65 / late take-up drop-out", () => {
  // Helper: a max-contributor 1961-born modeled with start ages 60, 65, 70
  // in one call. We pin YMPE/indexing growth to 0 so the AMPE cap (AYMPE/12)
  // is the same in every start year — which lets the take-up test isolate
  // the post-65 drop-out's effect from YMPE-growth-driven cap inflation.
  function trio(opts: {
    stopWorkAge?: number;
    assumedFutureEarnings?: number;
    futureEarningsGrowthRate?: number;
    ympeGrowthRate?: number;
  } = {}) {
    const base = makeInputs({ startAges: [60, 65, 70] });
    const inputs: ScenarioInputs = {
      ...base,
      assumptions: {
        ...base.assumptions,
        ympeGrowthRate: opts.ympeGrowthRate ?? 0,
        yampeGrowthRate: opts.ympeGrowthRate ?? 0,
        indexingRate: 0,
        stopWorkAge: opts.stopWorkAge ?? 65,
        assumedFutureEarnings: opts.assumedFutureEarnings ?? 0,
        futureEarningsGrowthRate: opts.futureEarningsGrowthRate ?? 0,
      },
    };
    const result = calculateCpp(inputs);
    const byAge = new Map(result.byStartAge.map((r) => [r.startAge, r]));
    return {
      r60: byAge.get(60)!,
      r65: byAge.get(65)!,
      r70: byAge.get(70)!,
    };
  }

  it("does not fire for take-up at 65 or earlier", () => {
    const { r60, r65 } = trio();
    expect(r60.base.post65DropoutMonths).toBe(0);
    expect(r65.base.post65DropoutMonths).toBe(0);
  });

  it("fires for take-up at 70 when post-65 earnings are zero (stop-working-at-65 case)", () => {
    const { r70 } = trio();
    // A 1961-born with stopWorkAge=65 and zero assumed future earnings has
    // 60 zero-earning months between turning 65 (Jan 2026) and Dec 2030
    // (the month before age 70 take-up in Jan 2031). Every one of those
    // months has indexed earnings of 0, well below the running mean, so all
    // 60 are dropped by post-65 drop-out.
    expect(r70.base.post65DropoutMonths).toBe(60);
  });

  it("delaying to 70 with zero post-65 earnings: AMPE reaches the AYMPE cap (zeros are dropped, not averaged in)", () => {
    // Direct proof the rule fires: with all 60 post-65 zero months dropped,
    // every remaining month is at YMPE-max (max contributor 1979-2025), so
    // AMPE_70 hits the AYMPE(start_year)/12 cap exactly. Without the rule,
    // AMPE_70 would be (564/624) × cap ≈ 90.4% of cap.
    const { r70 } = trio();
    expect(r70.base.ampe).toBeCloseTo(r70.base.aympeStartYear / 12, 2);
  });

  it("delaying to 70: base ratio vs age 65 is ≥ 1.42 (no longer dragged below the actuarial adjustment)", () => {
    // Before this rule, base_70 / base_65 was ~1.29 because 60 zero months
    // between age 65 and take-up dragged AMPE_70 down below AMPE_65, even
    // though the actuarial adjustment factor at 70 is 1.42. With the rule,
    // the ratio is ≥ 1.42 — possibly higher because AYMPE keeps rolling
    // forward and the start-year-70 cap exceeds the start-year-65 cap.
    const { r65, r70 } = trio();
    expect(r70.baseMonthly / r65.baseMonthly).toBeGreaterThanOrEqual(1.42);
  });

  it("does not fire for late take-up when post-65 earnings continue at YMPE-max", () => {
    // Same client but continues earning above-YMPE from 65 to 70. The cap
    // brings each post-65 month to exactly YMPE/12, which after indexing
    // equals the running mean (= AYMPE/12 cap). Since values must be
    // strictly LESS than the mean to be dropped, all post-65 months stay.
    const { r70 } = trio({
      stopWorkAge: 70,
      assumedFutureEarnings: 100_000, // comfortably above YMPE in any year
    });
    expect(r70.base.post65DropoutMonths).toBe(0);
  });
});
