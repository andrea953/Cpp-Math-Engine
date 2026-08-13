/**
 * Content policy for the client-facing (shared-link) results view.
 *
 * The printed client report (print-scenario.tsx) sets the plain-language
 * standard: no advisor diagnostics, no raw-data exports, no tier/YMPE
 * jargon, and friendly section labels. The on-screen shared view reuses the
 * same ResultsPanel component the advisor editor uses, so this module
 * centralizes which sections appear and which labels are used per audience.
 *
 * React-free so it can be unit-tested directly (see the cpp-calculator
 * vitest alias constraint on importing component modules).
 */

import { formatMoney } from "../../cpp/format";

export interface ResultsPanelSections {
  /** Contribution-cost card (rates, YBE/YMPE bands) — advisor-only. */
  showContributionCard: boolean;
  /** Summary/earnings CSV export buttons — advisor-only raw data. */
  showCsvExports: boolean;
  /** "Earnings vs YMPE" chart tab — advisor-only jargon. */
  showEarningsTab: boolean;
  /** Diagnostics drawer (AMPE, contributory months, accrual factors). */
  showDiagnostics: boolean;
  /** Step-by-step survivor calculation grid (× 60%, combined cap, …). */
  showSurvivorBreakdown: boolean;
  /** Per-tier % breakdown + Base/Tier 1/Tier 2 legend on start-age cards. */
  showTierBreakdown: boolean;
}

export function resultsPanelSections(clientView: boolean): ResultsPanelSections {
  return {
    showContributionCard: !clientView,
    showCsvExports: !clientView,
    showEarningsTab: !clientView,
    showDiagnostics: !clientView,
    showSurvivorBreakdown: !clientView,
    showTierBreakdown: !clientView,
  };
}

export interface ComparisonChartInputRow {
  startAge: number;
  base: number;
  tier1: number;
  tier2: number;
}

export const COMPARISON_TOTAL_SERIES = "Monthly total";
export const COMPARISON_ADVISOR_SERIES = ["Base", "Tier 1", "Tier 2"] as const;

/**
 * Series shown in the Monthly comparison bar chart. The client view gets a
 * single friendly total-benefit series; the advisor editor keeps the stacked
 * Base / Tier 1 / Tier 2 breakdown.
 */
export function comparisonChartSeries(clientView: boolean): string[] {
  return clientView ? [COMPARISON_TOTAL_SERIES] : [...COMPARISON_ADVISOR_SERIES];
}

/** Data rows for the Monthly comparison chart, keyed by the active series. */
export function comparisonChartData(
  clientView: boolean,
  rows: ComparisonChartInputRow[],
): Array<Record<string, string | number>> {
  return rows.map((r): Record<string, string | number> =>
    clientView
      ? {
          age: `Age ${r.startAge}`,
          [COMPARISON_TOTAL_SERIES]: Math.round(r.base + r.tier1 + r.tier2),
        }
      : {
          age: `Age ${r.startAge}`,
          Base: Math.round(r.base),
          "Tier 1": Math.round(r.tier1),
          "Tier 2": Math.round(r.tier2),
        },
  );
}

export function warningsHeading(clientView: boolean): string {
  return clientView ? "Good to know" : "Calculation warnings";
}

export function survivorCardTitle(clientView: boolean, startYear: number): string {
  return clientView
    ? `Benefits for your family (${startYear})`
    : `Survivor benefits (${startYear})`;
}

export function survivorTileLabels(clientView: boolean): {
  pension: string;
  deathBenefit: string;
  children: string;
} {
  return clientView
    ? {
        pension: "Monthly income for your spouse",
        deathBenefit: "One-time payment to help with final costs",
        children: "Monthly income for your children",
      }
    : {
        pension: "Survivor's pension",
        deathBenefit: "Death benefit",
        children: "Children's benefit",
      };
}

export function prbHeadlineLabel(clientView: boolean, stopAge: number): string {
  return clientView
    ? `If you keep working to age ${stopAge}`
    : `Incl. PRB at age ${stopAge}`;
}

/**
 * Friendly one-line explanation of the caregiving credit for the results
 * screen. Takes the engine's APPLIED caregiving credits
 * (`enhancement.appliedCaregivingDropIns`) for every displayed start-age
 * result, and only mentions years credited in ALL of them, so the note never
 * claims a credit that one of the shown options didn't actually receive.
 * Returns null when no caregiving credit was applied everywhere.
 *
 * Plain-language contract (client-facing): no "drop-in", "imputed", "CRDO",
 * "tier", or other actuary jargon.
 */
export function caregivingCreditNote(
  appliedByResult: Array<Array<{ year: number; amount: number }>>,
): string | null {
  if (appliedByResult.length === 0) return null;
  let credited = appliedByResult[0].filter((d) => d.amount > 0);
  for (const list of appliedByResult.slice(1)) {
    const years = new Set(list.filter((d) => d.amount > 0).map((d) => d.year));
    credited = credited.filter((d) => years.has(d.year));
  }
  if (credited.length === 0) return null;
  const avg = credited.reduce((sum, d) => sum + d.amount, 0) / credited.length;
  // Round to the nearest $100 — this is a reassurance line, not a statement.
  const approx = Math.round(avg / 100) * 100;
  const n = credited.length;
  return n === 1
    ? `Your caregiving year still counted: we credited it toward your pension as if you kept earning about ${formatMoney(approx)} that year.`
    : `Your ${n} caregiving years still counted: we credited them toward your pension as if you kept earning about ${formatMoney(approx)} a year.`;
}

export function prbSubtext(
  clientView: boolean,
  deltaText: string,
  stopAge: number,
): string {
  return clientView
    ? `+${deltaText}/mo permanent top-up from working after your payments start`
    : `+${deltaText}/mo from working to age ${stopAge} after starting`;
}
