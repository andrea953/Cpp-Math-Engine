import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiagnosticsPanel } from "../results-panel";
import { calculateCpp } from "@/cpp/calculate";
import { YMPE_HISTORY } from "@/cpp/constants";
import type { ScenarioInputs } from "@/cpp/types";

function makeInputs(): ScenarioInputs {
  return {
    birthYear: 1961,
    birthMonth: 1,
    earningsHistory: Array.from({ length: 47 }, (_, index) => {
      const year = 1979 + index;
      return { year, pensionableEarnings: YMPE_HISTORY[year] ?? 0 };
    }),
    dropoutPeriods: [],
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
}

function renderDiagnostics(inputs: ScenarioInputs): string {
  const result = calculateCpp(inputs);
  return renderToStaticMarkup(<DiagnosticsPanel sortedAges={result.byStartAge} />);
}

function baseSection(markup: string): string {
  const baseStart = markup.indexOf("Base CPP");
  const enhancementStart = markup.indexOf("Enhancement");
  return markup.slice(baseStart, enhancementStart);
}

describe("advisor diagnostics", () => {
  it("keeps multi-year and partial-year CRDO months under Base CPP", () => {
    const inputs = makeInputs();
    const crdoYears = new Set([1990, 1991]);
    const withCrdo: ScenarioInputs = {
      ...inputs,
      dropoutPeriods: [
        { kind: "crdo", startYear: 1990, startMonth: 1, endYear: 1991, endMonth: 3 },
      ],
      earningsHistory: inputs.earningsHistory.map((record) =>
        crdoYears.has(record.year) ? { ...record, pensionableEarnings: 0 } : record,
      ),
    };

    const markup = renderDiagnostics(withCrdo);
    const base = baseSection(markup);
    const enhancement = markup.slice(markup.indexOf("Enhancement"));

    expect(base).toContain("CRDO months set aside by year");
    expect(base).toContain("1990");
    expect(base).toContain("12 months");
    expect(base).toContain("1991");
    expect(base).toContain("3 months");
    expect(base).not.toContain("Drop-in (imputed) earnings by year");

    expect(enhancement).toContain("Potential imputed earnings by year");
    expect(enhancement).toContain("Candidate amounts only—not necessarily credited.");
    expect(enhancement).toContain("Tier 1 starts in 2019 and Tier 2 in 2024");
    expect(enhancement).toContain("1990");
    expect(enhancement).toContain("1991");
    expect(enhancement).toContain("CRDO drop-in credits actually applied");
    expect(enhancement).toContain(
      "No child-rearing drop-in credits were applied for this start age.",
    );
  });

  it("clearly states when no CRDO months were set aside", () => {
    const markup = renderDiagnostics(makeInputs());
    const base = baseSection(markup);

    expect(base).toContain("No CRDO months were set aside for this start age.");
    expect(markup).not.toContain("Potential imputed earnings by year");
    expect(markup).toContain("No child-rearing drop-in credits were applied for this start age.");
  });

  it("keeps disability totals separate from CRDO year rows in a mixed scenario", () => {
    const inputs = makeInputs();
    const withMixedPeriods: ScenarioInputs = {
      ...inputs,
      dropoutPeriods: [
        { kind: "crdo", startYear: 1990, startMonth: 1, endYear: 1991, endMonth: 3 },
        { kind: "disability", startYear: 1995, startMonth: 1, endYear: 1995, endMonth: 6 },
      ],
      earningsHistory: inputs.earningsHistory.map((record) =>
        record.year === 1990 || record.year === 1991 || record.year === 1995
          ? { ...record, pensionableEarnings: 0 }
          : record,
      ),
    };

    const markup = renderDiagnostics(withMixedPeriods);
    const base = baseSection(markup);
    const crdoBreakdownStart = base.indexOf("CRDO months set aside by year (CRDO only)");
    const disabilityRowStart = base.indexOf("Disability months dropped");
    const crdoBreakdown = base.slice(crdoBreakdownStart, disabilityRowStart);
    const disabilityRow = base.slice(disabilityRowStart, disabilityRowStart + 180);

    expect(crdoBreakdown).toContain("CRDO months set aside by year (CRDO only)");
    expect(crdoBreakdown).toContain("1990");
    expect(crdoBreakdown).toContain("12 months");
    expect(crdoBreakdown).toContain("1991");
    expect(crdoBreakdown).toContain("3 months");
    expect(crdoBreakdown).not.toContain("1995");

    expect(base).toContain("Disability months dropped");
    expect(disabilityRow).toContain(">6</span>");
  });

  it("separates potential amounts from child-rearing credits actually applied", () => {
    const inputs = makeInputs();
    const crdoYears = new Set([2020, 2021, 2022]);
    const withCrdo: ScenarioInputs = {
      ...inputs,
      dropoutPeriods: [
        { kind: "crdo", startYear: 2020, startMonth: 1, endYear: 2022, endMonth: 12 },
      ],
      earningsHistory: inputs.earningsHistory.map((record) =>
        crdoYears.has(record.year) ? { ...record, pensionableEarnings: 0 } : record,
      ),
    };

    const markup = renderDiagnostics(withCrdo);
    const potentialStart = markup.indexOf("Potential imputed earnings by year");
    const appliedStart = markup.indexOf("CRDO drop-in credits actually applied");
    const potential = markup.slice(potentialStart, appliedStart);
    const applied = markup.slice(appliedStart);

    expect(potential).toContain("Candidate amounts only—not necessarily credited.");
    expect(potential).toContain("2020");
    expect(potential).toContain("2021");
    expect(potential).toContain("2022");
    expect(applied).toContain("2020");
    expect(applied).toContain("2021");
    expect(applied).toContain("2022");
    expect(applied).not.toContain("No child-rearing drop-in credits were applied");
  });

  it("shows disability drop-in amounts actually applied separately", () => {
    const inputs = makeInputs();
    const disabilityYears = new Set([2022, 2023, 2024, 2025]);
    const withDisability: ScenarioInputs = {
      ...inputs,
      dropoutPeriods: [
        { kind: "disability", startYear: 2022, startMonth: 1, endYear: 2025, endMonth: 12 },
      ],
      earningsHistory: inputs.earningsHistory.map((record) =>
        disabilityYears.has(record.year) ? { ...record, pensionableEarnings: 0 } : record,
      ),
    };

    const markup = renderDiagnostics(withDisability);
    const appliedStart = markup.indexOf("Disability drop-in credits actually applied");
    const applied = markup.slice(appliedStart);

    expect(appliedStart).toBeGreaterThanOrEqual(0);
    expect(applied).toContain("70% of average pensionable earnings in the six years");
    for (const year of disabilityYears) expect(applied).toContain(String(year));
    expect(applied).not.toContain("No disability drop-in credits were applied");
  });

  it("renders diagnostics and Base CPP details for every selected start age", () => {
    const inputs: ScenarioInputs = {
      ...makeInputs(),
      startAges: [60, 65],
    };

    const markup = renderDiagnostics(inputs);

    expect(markup.match(/<div data-state="closed" data-orientation="vertical"/g)).toHaveLength(2);
    expect(markup).toContain("Age 60");
    expect(markup).toContain("Age 65");
    expect(markup.match(/Base CPP/g)).toHaveLength(2);
  });
});
