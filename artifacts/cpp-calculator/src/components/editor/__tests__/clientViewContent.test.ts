import { describe, expect, it } from "vitest";
import {
  caregivingCreditNote,
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

describe("caregiving credit note", () => {
  it("explains multiple caregiving years with an approximate annual credit", () => {
    const note = caregivingCreditNote([
      [
        { year: 2019, amount: 47_800 },
        { year: 2020, amount: 48_100 },
        { year: 2021, amount: 48_400 },
      ],
    ]);
    expect(note).toBe(
      "Your 3 caregiving years still counted: we credited them toward your pension as if you kept earning about $48,100 a year.",
    );
  });

  it("uses singular wording for a single credited year", () => {
    const note = caregivingCreditNote([[{ year: 2020, amount: 51_240 }]]);
    expect(note).toContain("Your caregiving year still counted");
    expect(note).toContain("$51,200");
  });

  it("returns null when no result received an applied credit", () => {
    expect(caregivingCreditNote([])).toBeNull();
    expect(caregivingCreditNote([[]])).toBeNull();
    expect(caregivingCreditNote([[{ year: 2020, amount: 0 }]])).toBeNull();
  });

  it("only mentions years credited in every displayed start-age option", () => {
    // Credited at ages 65/70 but not at 60 → no note (never over-claims).
    expect(
      caregivingCreditNote([
        [],
        [{ year: 2020, amount: 48_000 }],
        [{ year: 2020, amount: 48_000 }],
      ]),
    ).toBeNull();
    // Shared year mentioned; extra year in one option only is excluded.
    const note = caregivingCreditNote([
      [{ year: 2020, amount: 48_000 }],
      [
        { year: 2020, amount: 48_000 },
        { year: 2021, amount: 48_000 },
      ],
    ]);
    expect(note).toContain("Your caregiving year still counted");
  });

  it("avoids actuary jargon in the client-facing wording", () => {
    const note = caregivingCreditNote([[{ year: 2020, amount: 48_000 }]])!;
    for (const banned of [/drop.?in/i, /imputed/i, /CRDO/i, /tier/i, /accrual/i, /enhancement/i]) {
      expect(note).not.toMatch(banned);
    }
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
