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

    // Tokenize on tabs, commas, or runs of whitespace, but first remove any
    // thousands-separator commas inside numbers so "$42,000" stays one token.
    const tokens = stripThousandsCommas(line)
      .split(/[,\t]|\s{2,}/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (tokens.length < 2) {
      // Single-token lines (probably labels) — skip
      skippedLines += 1;
      continue;
    }

    // Find a year-looking number and an earnings-looking number.
    // Service Canada SOC table layout (left to right):
    //   Year | Pensionable earnings | Year's Maximum Pensionable Earnings (YMPE) | Your contributions
    // The FIRST numeric column after the year is the user's pensionable earnings,
    // so we take the first plausible number after the year position rather than the
    // largest number on the line (which would be the YMPE column for non-capped earners).
    const numericTokens = tokens.map((t) => cleanNumber(t));
    let year: number | null = null;
    let yearIdx = -1;
    for (let i = 0; i < numericTokens.length; i++) {
      const n = numericTokens[i];
      if (n === null) continue;
      if (looksLikeYear(n)) {
        year = n;
        yearIdx = i;
        break;
      }
    }

    let earnings: number | null = null;
    if (year !== null) {
      for (let i = yearIdx + 1; i < numericTokens.length; i++) {
        const n = numericTokens[i];
        if (n === null) continue;
        if (looksLikeYear(n)) continue;
        if (n >= 0 && n < 1_000_000) {
          earnings = n;
          break;
        }
      }
      // Fallback: if no numeric appeared after the year (e.g. "earnings year" order),
      // try the first plausible number anywhere on the line that isn't the year itself.
      if (earnings === null) {
        for (let i = 0; i < numericTokens.length; i++) {
          if (i === yearIdx) continue;
          const n = numericTokens[i];
          if (n === null) continue;
          if (looksLikeYear(n)) continue;
          if (n >= 0 && n < 1_000_000) {
            earnings = n;
            break;
          }
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
