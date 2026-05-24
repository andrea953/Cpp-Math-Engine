/**
 * Service Canada Statement of Contributions (SOC) parser.
 *
 * Accepts a few common formats:
 *  - Pasted text from the Service Canada SOC web page
 *  - CSV with columns: year, pensionable_earnings (or year,earnings)
 *  - Tab-separated text copied from a PDF table
 *
 * Returns parsed earnings records plus any warnings about lines we couldn't read.
 */

import type { EarningsRecord } from "./types";
import { YAMPE_HISTORY, YMPE_HISTORY } from "./constants";

/**
 * Year CPP2 (Tier 2) launched. SOC PDFs for 2024+ may include a
 * "Second additional pensionable earnings" column for the YAMPE band
 * (earnings between YMPE and YAMPE) — when present, those dollars must be
 * added to the regular pensionable-earnings column to obtain the total
 * YAMPE-level earnings the engine expects.
 */
const TIER2_LAUNCH_YEAR = 2024;

export interface SocParseResult {
  records: EarningsRecord[];
  warnings: string[];
  /** Number of lines parsed successfully */
  parsedLines: number;
  /** Number of lines that were skipped (header, blank, or unrecognized) */
  skippedLines: number;
}

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Remove thousands-separator commas inside numbers (e.g. "$42,000" -> "$42000",
 * "$1,234,567" -> "$1234567") so the tokenizer doesn't split on them. We only
 * match COMPLETE thousands-pattern numbers — 1-3 leading digits, then one or
 * more groups of exactly 3 digits separated by commas, not followed by another
 * digit. This preserves real CSV delimiters: "2023,999" and "2023,42000" are
 * untouched because neither side parses as a thousands-pattern number.
 */
function stripThousandsCommas(s: string): string {
  return s.replace(/\b\d{1,3}(?:,\d{3})+(?!\d)/g, (m) => m.replace(/,/g, ""));
}

/**
 * Service Canada flags individual SOC values with single-letter codes:
 *   M = year's maximum pensionable earnings reached
 *   S = self-employed contribution
 *   B = below the year's basic exemption
 *   A = amended
 * They appear in the rendered PDF as a lone capital letter following a
 * dollar value, separated only by a single space (e.g. "$51,100.00 M").
 * Without preprocessing, the `\s{2,}` tokenizer would glue the flag to the
 * value (yielding the unparseable token "$51100.00 M") and the parser would
 * fall back to the contribution amount instead of the pensionable earnings.
 * Strip these flag letters so the value becomes a clean numeric token.
 */
function stripSocFlags(s: string): string {
  return s.replace(/(\d)\s+([MSBA])\b/g, "$1");
}

function cleanNumber(raw: string): number | null {
  if (!raw) return null;
  const stripped = raw
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (stripped === "" || stripped === "-" || stripped === "—") return 0;
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

function looksLikeYear(n: number): boolean {
  return Number.isInteger(n) && n >= 1966 && n <= CURRENT_YEAR + 1;
}

export function parseSoc(input: string): SocParseResult {
  const records: EarningsRecord[] = [];
  const warnings: string[] = [];
  let parsedLines = 0;
  let skippedLines = 0;

  const lines = input.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      skippedLines += 1;
      continue;
    }

    // Extract numeric tokens directly via regex after stripping thousands
    // commas and Service Canada flag letters. We can't tokenize by whitespace
    // alone because the rendered SOC PDF sometimes separates adjacent numeric
    // columns with a single space (e.g. "$2,356.20 $51,100.00"), and we can't
    // tokenize by single whitespace because other inputs use spaces inside
    // labels. Regex-based numeric extraction handles both cleanly.
    const cleanedLine = stripSocFlags(stripThousandsCommas(line));
    const numericTokens: number[] = [];
    for (const m of cleanedLine.matchAll(/-?\d+(?:\.\d+)?/g)) {
      const n = Number(m[0]);
      if (Number.isFinite(n)) numericTokens.push(n);
    }

    if (numericTokens.length < 2) {
      // Header/label lines or rows with only a year — skip
      skippedLines += 1;
      continue;
    }

    // Service Canada SOC PDF rows show year + several smaller dollar amounts
    // (Total contribution, Base contribution, optional First/Second additional
    // contributions, optional First/Second additional earnings) plus the user's
    // Pensionable Earnings. Pensionable earnings (Tier 1, capped at YMPE) is
    // always the LARGEST value on the row because contributions and additional
    // sub-portions are by definition smaller than the gross earnings they're
    // computed from.
    //
    // For simple "year, earnings" CSV input there's only one non-year number,
    // so picking the largest is equivalent.
    let year: number | null = null;
    let earnings: number | null = null;
    // Locate the year first, then consider every other token.
    const nonYearTokens: number[] = [];
    for (const n of numericTokens) {
      if (year === null && looksLikeYear(n)) {
        year = n;
        continue;
      }
      nonYearTokens.push(n);
    }
    for (const n of nonYearTokens) {
      // Earnings: non-negative, plausibly under $1M, take the maximum on the row.
      if (n >= 0 && n < 1_000_000 && (earnings === null || n > earnings)) {
        earnings = n;
      }
    }

    // 2024+ SOC PDFs from Service Canada include a "Second additional
    // pensionable earnings" column for the YAMPE band (the slice between
    // YMPE and YAMPE). The engine expects ONE earnings number per year
    // representing the total pensionable earnings up to YAMPE — so when the
    // SOC row is rich enough to be a full PDF transcript (≥ 7 non-year
    // tokens, matching the 2024+ 8-column layout: base / 1st add'l / 2nd
    // add'l / total contribution + pensionable / 1st add'l pensionable /
    // 2nd add'l pensionable earnings) we add the rightmost token (the YAMPE
    // band) to the Tier 1 max.
    //
    // We rely on column POSITION rather than magnitude because the Total
    // contribution and Tier 2 earnings can be similar dollar amounts and
    // can't be distinguished by size alone (e.g. a sub-YMPE earner with
    // $2,700 total contributions and $0 Tier 2 earnings).
    if (
      year !== null &&
      earnings !== null &&
      year >= TIER2_LAUNCH_YEAR &&
      nonYearTokens.length >= 7
    ) {
      const ympe = YMPE_HISTORY[year];
      const yampe = YAMPE_HISTORY[year];
      if (ympe !== undefined && yampe !== undefined && yampe > ympe) {
        // Allow a $50 rounding buffer over the published YAMPE − YMPE band.
        const tier2Cap = yampe - ympe + 50;
        const last = nonYearTokens[nonYearTokens.length - 1];
        if (last > 0 && last < earnings && last <= tier2Cap) {
          earnings += last;
        }
      }
    }

    if (year !== null && earnings !== null && !looksLikeYear(earnings)) {
      records.push({ year, pensionableEarnings: earnings });
      parsedLines += 1;
    } else {
      skippedLines += 1;
    }
  }

  // Dedupe by year (keep the latest occurrence)
  const byYear = new Map<number, number>();
  for (const r of records) byYear.set(r.year, r.pensionableEarnings);
  const dedupedRecords = Array.from(byYear.entries())
    .map(([year, pensionableEarnings]) => ({ year, pensionableEarnings }))
    .sort((a, b) => a.year - b.year);

  if (dedupedRecords.length === 0) {
    warnings.push(
      "Could not detect any (year, earnings) pairs. Try CSV format: year,earnings — one per line.",
    );
  }

  return {
    records: dedupedRecords,
    warnings,
    parsedLines,
    skippedLines,
  };
}
