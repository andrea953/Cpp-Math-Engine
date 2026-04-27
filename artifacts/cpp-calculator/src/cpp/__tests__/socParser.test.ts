/**
 * Service Canada Statement of Contributions (SOC) parser tests.
 *
 * Covers the cases that previously broke in production:
 *  (a) PDF row with year + multiple smaller numbers + Pensionable Earnings (largest)
 *  (b) Plain CSV `year,earnings`
 *  (c) Values containing `$` and thousands commas
 *  (d) Ambiguous CSV like `2023,999` (small earnings) — must NOT be corrupted
 *  (e) Duplicate years dedupe to last write
 *  (f) Garbage lines counted as skippedLines, no throw
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSoc } from "../socParser";
import { pinYear, unpinTime } from "./_time";

beforeAll(() => pinYear(2026, 6, 15));
afterAll(() => unpinTime());

describe("SOC parser — Service Canada PDF row format", () => {
  it("picks pensionable earnings as the largest numeric token on the row", () => {
    // Row: Year | Total contrib | Base contrib | First addt'l contrib | Pensionable earnings
    const input = "2024\t3,217.50\t2,910.00\t307.50\t68500";
    const result = parseSoc(input);
    expect(result.records).toEqual([{ year: 2024, pensionableEarnings: 68500 }]);
    expect(result.parsedLines).toBe(1);
  });

  it("handles tab-separated rows from PDF copy-paste", () => {
    const input = `2022\t3,499.80\t3,166.65\t333.15\t64,900\n2023\t3,754.45\t3,407.40\t347.05\t66,600`;
    const result = parseSoc(input);
    expect(result.records).toEqual([
      { year: 2022, pensionableEarnings: 64900 },
      { year: 2023, pensionableEarnings: 66600 },
    ]);
  });
});

describe("SOC parser — CSV `year,earnings`", () => {
  it("parses a simple CSV", () => {
    const input = "2020,55000\n2021,58000\n2022,62000";
    const result = parseSoc(input);
    expect(result.records).toEqual([
      { year: 2020, pensionableEarnings: 55000 },
      { year: 2021, pensionableEarnings: 58000 },
      { year: 2022, pensionableEarnings: 62000 },
    ]);
  });

  it("parses CSV with a small earnings value (`2023,999`) without corruption", () => {
    const result = parseSoc("2023,999");
    expect(result.records).toEqual([{ year: 2023, pensionableEarnings: 999 }]);
  });

  it("parses CSV `2023,42000` correctly (does not merge into one number)", () => {
    const result = parseSoc("2023,42000");
    expect(result.records).toEqual([{ year: 2023, pensionableEarnings: 42000 }]);
  });
});

describe("SOC parser — currency and thousands separators", () => {
  it("handles `$42,000` as a single tokenized number", () => {
    const result = parseSoc("2024,$42,000");
    expect(result.records).toEqual([{ year: 2024, pensionableEarnings: 42000 }]);
  });

  it("handles `$1,234,567` (multi-group thousands)", () => {
    // Earnings are capped to <$1M by the parser, so this won't be picked up
    // as earnings — the test verifies that the comma-stripping pass doesn't
    // corrupt the line into a parse error.
    const result = parseSoc("2024,$1,234,567,68500");
    // The 68500 (smaller, plausible) is selected over the >$1M outlier.
    expect(result.records).toEqual([{ year: 2024, pensionableEarnings: 68500 }]);
  });

  it("handles whitespace-separated values from text copies", () => {
    const input = "2025  $71,300";
    const result = parseSoc(input);
    expect(result.records).toEqual([{ year: 2025, pensionableEarnings: 71300 }]);
  });
});

describe("SOC parser — duplicates", () => {
  it("dedupes by year, keeping the last occurrence", () => {
    const input = "2024,50000\n2024,55000\n2025,60000";
    const result = parseSoc(input);
    expect(result.records).toEqual([
      { year: 2024, pensionableEarnings: 55000 },
      { year: 2025, pensionableEarnings: 60000 },
    ]);
  });
});

describe("SOC parser — garbage lines", () => {
  it("skips header lines, blank lines, and unrecognized text without throwing", () => {
    const input = `Year\tEarnings
2020,55000

Some random label

2021,58000
???`;
    const result = parseSoc(input);
    expect(result.records).toEqual([
      { year: 2020, pensionableEarnings: 55000 },
      { year: 2021, pensionableEarnings: 58000 },
    ]);
    expect(result.skippedLines).toBeGreaterThan(0);
  });

  it("returns a warning when no records can be parsed", () => {
    const result = parseSoc("just some text\nnothing useful here");
    expect(result.records).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
