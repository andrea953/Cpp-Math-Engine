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
  return renderToStaticMarkup(<DiagnosticsPanel sortedAges={[result.byStartAge[0]]} />);
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
});