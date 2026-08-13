import { describe, expect, it } from "vitest";
import {
  comparisonChartData,
  comparisonChartSeries,
  prbHeadlineLabel,
  prbSubtext,
  resultsPanelSections,
  survivorCardTitle,
  survivorTileLabels,
  warningsHeading,
} from "../client-view-content";

describe("resultsPanelSections", () => {
  it("hides all advisor-only technical sections on the client view", () => {
    const s = resultsPanelSections(true);
    expect(s.showContributionCard).toBe(false);
    expect(s.showCsvExports).toBe(false);
    expect(s.showEarningsTab).toBe(false);
    expect(s.showDiagnostics).toBe(false);
    expect(s.showSurvivorBreakdown).toBe(false);
    expect(s.showTierBreakdown).toBe(false);
  });

  it("keeps every section for the advisor editor", () => {
    const s = resultsPanelSections(false);
    expect(Object.values(s).every((v) => v === true)).toBe(true);
  });
});

describe("comparison chart series", () => {
  const rows = [
    { startAge: 65, base: 800.4, tier1: 100.2, tier2: 50.1 },
    { startAge: 70, base: 1100.6, tier1: 140.3, tier2: 70.2 },
  ];

  it("client view renders a single total series with no Base/Tier keys", () => {
    expect(comparisonChartSeries(true)).toEqual(["Monthly total"]);
    const data = comparisonChartData(true, rows);
    expect(data[0]).toEqual({ age: "Age 65", "Monthly total": 951 });
    for (const row of data) {
      for (const key of Object.keys(row)) {
        expect(key).not.toMatch(/Base|Tier/);
      }
    }
  });

  it("advisor view keeps the stacked Base / Tier 1 / Tier 2 breakdown", () => {
    expect(comparisonChartSeries(false)).toEqual(["Base", "Tier 1", "Tier 2"]);
    const data = comparisonChartData(false, rows);
    expect(data[1]).toEqual({
      age: "Age 70",
      Base: 1101,
      "Tier 1": 140,
      "Tier 2": 70,
    });
  });
});

describe("client-facing labels match the printed report wording", () => {
  it("uses the print report's family labels", () => {
    expect(survivorCardTitle(true, 2031)).toBe("Benefits for your family (2031)");
    expect(survivorTileLabels(true)).toEqual({
      pension: "Monthly income for your spouse",
      deathBenefit: "One-time payment to help with final costs",
      children: "Monthly income for your children",
    });
  });

  it("avoids actuary jargon in client PRB and warning labels", () => {
    expect(prbHeadlineLabel(true, 70)).toBe("If you keep working to age 70");
    expect(prbHeadlineLabel(true, 70)).not.toContain("PRB");
    expect(prbSubtext(true, "$42.00", 70)).toBe(
      "+$42.00/mo permanent top-up from working after your payments start",
    );
    expect(warningsHeading(true)).toBe("Good to know");
  });

  it("keeps technical labels for the advisor", () => {
    expect(survivorCardTitle(false, 2031)).toBe("Survivor benefits (2031)");
    expect(prbHeadlineLabel(false, 70)).toContain("PRB");
    expect(warningsHeading(false)).toBe("Calculation warnings");
  });
});
