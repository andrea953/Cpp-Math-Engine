import { describe, expect, it } from "vitest";
import { whitePaperExamples as ex } from "../whitePaperExamples";
import {
  ENHANCEMENT_FULL_YEARS,
  GENERAL_DROPOUT_RATE,
  TIER1_FULL_REPLACEMENT_RATE,
  TIER2_REPLACEMENT_RATE,
  YBE,
  getYampe,
  getYmpe,
} from "../constants";
import { DEFAULT_ASSUMPTIONS } from "../defaults";

describe("white paper examples", () => {
  it("uses the documented representative client profile", () => {
    expect(ex.profile.birthYear).toBe(1965);
    expect(ex.profile.birthMonth).toBe(6);
    expect(ex.profile.startAge).toBe(65);
    expect(ex.profile.startYear).toBe(2030);
    expect(ex.profile.yearsOfMaxEarnings).toBe(35);
  });

  it("AYMPE example averages five years of YMPE ending in the start year", () => {
    expect(ex.aympeYears).toHaveLength(5);
    const first = ex.aympeYears[0];
    const last = ex.aympeYears[4];
    expect(first.year).toBe(2026);
    expect(last.year).toBe(2030);
    const sum = ex.aympeYears.reduce((acc, y) => acc + y.ympe, 0);
    expect(ex.aympeStart).toBeCloseTo(sum / 5, 6);
  });

  it("AMPE indexing example walks through the published formula", () => {
    const expectedYmpe = getYmpe(ex.ampeIndex.year, DEFAULT_ASSUMPTIONS.ympeGrowthRate);
    expect(ex.ampeIndex.ympe).toBeCloseTo(expectedYmpe, 6);
    expect(ex.ampeIndex.cappedMonthly).toBeCloseTo(expectedYmpe / 12, 6);
    expect(ex.ampeIndex.indexedMonthly).toBeCloseTo(
      (expectedYmpe / 12) * (ex.aympeStart / expectedYmpe),
      6,
    );
  });

  it("base CPP example is AMPE × 25%", () => {
    expect(ex.base.monthlyAt65).toBeCloseTo(ex.ampe * 0.25, 6);
    expect(ex.base.monthlyWithDropout).toBeCloseTo(ex.ampe * 0.25, 6);
  });

  it("17% drop-out example demonstrates a meaningful uplift", () => {
    expect(ex.base.contribMonths).toBe(564);
    expect(ex.base.generalDropoutMonths).toBe(
      Math.floor(ex.base.contribMonths * GENERAL_DROPOUT_RATE),
    );
    expect(ex.base.monthsRetained).toBe(
      ex.base.contribMonths - ex.base.generalDropoutMonths,
    );
    expect(ex.base.dropoutLift).toBeGreaterThan(0);
    expect(ex.base.monthlyWithDropout).toBeGreaterThan(ex.base.monthlyNoDropout);
  });

  it("Tier 1 phase-in example matches engine constants", () => {
    const p = ex.tier1.phaseExample;
    expect(p.year).toBe(2019);
    const ympe = getYmpe(p.year, DEFAULT_ASSUMPTIONS.ympeGrowthRate);
    expect(p.ympe).toBeCloseTo(ympe, 6);
    expect(p.tier1Earn).toBeCloseTo(ympe - YBE, 6);
    expect(p.phaseFactor).toBeCloseTo(0.15, 6);
    expect(p.weighted).toBeCloseTo(p.indexed * p.phaseFactor, 6);

    const f = ex.tier1.fullExample;
    expect(f.year).toBe(2023);
    expect(f.phaseFactor).toBe(1);
  });

  it("Tier 1 accrual example reflects the 40-year rule", () => {
    expect(ex.tier1.enhancementFullYears).toBe(ENHANCEMENT_FULL_YEARS);
    expect(ex.tier1.contributionYears).toBeGreaterThan(0);
    expect(ex.tier1.accrualFactor).toBeCloseTo(
      Math.min(1, ex.tier1.contributionYears / ENHANCEMENT_FULL_YEARS),
      6,
    );
    expect(ex.tier1.fullRate).toBe(TIER1_FULL_REPLACEMENT_RATE);
    expect(ex.tier1.monthlyAt65).toBeGreaterThan(0);
  });

  it("Tier 2 example shows the YMPE→YAMPE band and an alt-scenario dollar amount", () => {
    const t = ex.tier2.yearExample;
    expect(t.year).toBe(2024);
    const ympe = getYmpe(t.year, DEFAULT_ASSUMPTIONS.ympeGrowthRate);
    const yampe = getYampe(t.year, DEFAULT_ASSUMPTIONS.yampeGrowthRate);
    expect(t.tier2Earn).toBeCloseTo(yampe - ympe, 6);
    expect(t.indexed).toBeCloseTo(t.tier2Earn * (ex.ayampeStart / yampe), 6);
    expect(ex.tier2.rate).toBe(TIER2_REPLACEMENT_RATE);
    expect(ex.tier2.altScenarioMonthlyAt65).toBeGreaterThan(0);
  });

  it("Adjustment example matches the statutory factors", () => {
    expect(ex.adjustment.factor60).toBeCloseTo(1 - 0.006 * 60, 6);
    expect(ex.adjustment.factor65).toBe(1);
    expect(ex.adjustment.factor70).toBeCloseTo(1 + 0.007 * 60, 6);
    expect(ex.adjustment.total60).toBeLessThan(ex.adjustment.total65);
    expect(ex.adjustment.total70).toBeGreaterThan(ex.adjustment.total65);
  });

  it("CRDO drop-out example shows a positive uplift vs the same client without the claim", () => {
    const c = ex.crdoExample;
    expect(c.gapEndYear - c.gapStartYear + 1).toBe(c.yearsOff);
    expect(c.monthsOff).toBe(c.yearsOff * 12);
    expect(c.crdoMonthsDropped).toBe(c.monthsOff);
    expect(c.contribMonths).toBeGreaterThan(c.monthsOff);
    expect(c.monthsRetainedWithout).toBeLessThan(c.contribMonths);
    expect(c.monthsRetainedWith).toBeLessThan(c.contribMonths - c.crdoMonthsDropped + 1);
    expect(c.ampeWith).toBeGreaterThan(c.ampeWithout);
    expect(c.baseMonthlyWith).toBeGreaterThan(c.baseMonthlyWithout);
    expect(c.baseLift).toBeCloseTo(c.baseMonthlyWith - c.baseMonthlyWithout, 6);
    expect(c.totalLift).toBeCloseTo(c.totalMonthlyWith - c.totalMonthlyWithout, 6);
    // Drop-outs only affect base CPP (Tier 1/2 skip zero-earning years), so
    // the total uplift should match the base uplift to a few decimals.
    expect(c.totalLift).toBeCloseTo(c.baseLift, 4);
    expect(c.baseLift).toBeGreaterThan(0);
  });

  it("Disability drop-out example shows a positive uplift vs the same client without the claim", () => {
    const d = ex.disabilityExample;
    expect(d.gapEndYear - d.gapStartYear + 1).toBe(d.yearsOff);
    expect(d.monthsOff).toBe(d.yearsOff * 12);
    expect(d.disabilityMonthsDropped).toBe(d.monthsOff);
    expect(d.ampeWith).toBeGreaterThan(d.ampeWithout);
    expect(d.baseMonthlyWith).toBeGreaterThan(d.baseMonthlyWithout);
    expect(d.baseLift).toBeCloseTo(d.baseMonthlyWith - d.baseMonthlyWithout, 6);
    expect(d.totalLift).toBeCloseTo(d.totalMonthlyWith - d.totalMonthlyWithout, 6);
    expect(d.totalLift).toBeCloseTo(d.baseLift, 4);
    expect(d.baseLift).toBeGreaterThan(0);
  });

  it("Survivor combined-cap example demonstrates a non-zero claw-back", () => {
    expect(ex.survivor.cap).toBeGreaterThan(0);
    expect(ex.survivor.deceasedBaseTier1).toBeGreaterThan(0);
    expect(ex.survivor.pensionUncapped).toBeCloseTo(ex.survivor.deceasedBaseTier1 * 0.6, 6);
    expect(ex.survivor.capReduction).toBeGreaterThan(0);
    expect(ex.survivor.pensionAfterCap).toBeLessThan(ex.survivor.pensionUncapped);
  });

  it("Total monthly CPP example is the sum of base + Tier 1 + Tier 2", () => {
    expect(ex.total.monthly).toBeCloseTo(
      ex.total.base + ex.total.tier1 + ex.total.tier2,
      6,
    );
    expect(ex.total.monthly).toBeGreaterThan(0);
  });

  it("PRB example matches the documented per-year accrual formula", () => {
    expect(ex.prb.ratio).toBeCloseTo(
      Math.min(1, ex.prb.annualEarnings / ex.prb.ympeAtStart),
      6,
    );
    expect(ex.prb.firstYearAnnual).toBeCloseTo(
      ((ex.prb.startMonthly * 12) / 40) * ex.prb.ratio,
      6,
    );
    expect(ex.prb.firstYearMonthly).toBeCloseTo(ex.prb.firstYearAnnual / 12, 6);
    expect(ex.prb.annualUpliftAt70).toBeGreaterThan(0);
  });
});

describe("white paper formula coverage", () => {
  it("every Formula block in white-paper.tsx is followed by an Example", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const wp = await readFile(
      path.resolve(here, "..", "..", "components", "white-paper.tsx"),
      "utf8",
    );

    const formulaOpens = [...wp.matchAll(/<Formula(?:\s|>)/g)];
    expect(formulaOpens.length).toBeGreaterThan(0);

    for (const match of formulaOpens) {
      const formulaStart = match.index ?? 0;
      const closeIdx = wp.indexOf("</Formula>", formulaStart);
      expect(closeIdx).toBeGreaterThan(formulaStart);
      const after = wp.slice(closeIdx, closeIdx + 400);
      expect(
        after.includes("<Example>"),
        `Formula at index ${formulaStart} has no <Example> within 400 chars`,
      ).toBe(true);
    }
  });
});
