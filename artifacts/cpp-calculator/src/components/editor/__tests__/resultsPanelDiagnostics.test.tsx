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

    expect(enhancement).toContain("Drop-in (imputed) earnings by year");
    expect(enhancement).toContain("1990");
    expect(enhancement).toContain("1991");
  });

  it("clearly states when no CRDO months were set aside", () => {
    const markup = renderDiagnostics(makeInputs());
    const base = baseSection(markup);

    expect(base).toContain("No CRDO months were set aside for this start age.");
    expect(markup).not.toContain("Drop-in (imputed) earnings by year");
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
