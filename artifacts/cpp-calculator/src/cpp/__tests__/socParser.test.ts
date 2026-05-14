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

describe("SOC parser — Service Canada flag suffixes (M/S/B/A)", () => {
  // Service Canada flags individual SOC values with single-letter codes:
  // M = year's max reached, S = self-employed, B = below YBE, A = amended.
  // The flag is glued to the dollar value with a single space in the rendered
  // PDF, e.g. "$51,100.00 M". Without preprocessing, the tokenizer would
  // produce the unparseable token "$51100.00 M" and fall back to the
  // contribution amount instead of the pensionable earnings.

  it("strips trailing M flag and picks the pensionable earnings", () => {
    const input = "2013   $2,356.20    $2,356.20 $51,100.00 M";
    const result = parseSoc(input);
    expect(result.records).toEqual([{ year: 2013, pensionableEarnings: 51100 }]);
  });

  it("strips B flag (below year's basic exemption)", () => {
    const input = "2008   $0.00    $0.00   $0.00  B";
    const result = parseSoc(input);
    expect(result.records).toEqual([{ year: 2008, pensionableEarnings: 0 }]);
  });

  it("strips multiple flags on one row (S contribution + M earnings)", () => {
    const input = "2021   $3,771.90 S $381.00   $4,152.90 $61,600.00 M $61,600.00 M";
    const result = parseSoc(input);
    expect(result.records).toEqual([{ year: 2021, pensionableEarnings: 61600 }]);
  });

  it("parses a full Service Canada SOC PDF transcript end-to-end", () => {
    // Real layout from the user's "MICHAEL S VENTRESCA" SOC PDF (Mar 1983)
    const input = `2003               $14.18                                                            $14.18        $3,786.00
2004               $103.65                                                           $103.65       $5,594.00
2005               $171.12                                                           $171.12       $6,957.00
2008               $0.00                                                             $0.00         $0.00        B
2012               $2,306.70                                                         $2,306.70 $50,099.00
2013               $2,356.20                                                         $2,356.20 $51,100.00 M
2018               $2,593.80                                                         $2,593.80 $55,900.00 M
2019               $2,668.05         $80.85                                          $2,748.90 $57,400.00 M $57,400.00 M
2021               $3,771.90 S $381.00                                               $4,152.90 $61,600.00 M $61,600.00 M
2023               $6,246.90 S $1,262.00                                             $7,508.90 $66,600.00 M $66,600.00 M`;
    const result = parseSoc(input);
    expect(result.records).toEqual([
      { year: 2003, pensionableEarnings: 3786 },
      { year: 2004, pensionableEarnings: 5594 },
      { year: 2005, pensionableEarnings: 6957 },
      { year: 2008, pensionableEarnings: 0 },
      { year: 2012, pensionableEarnings: 50099 },
      { year: 2013, pensionableEarnings: 51100 },
      { year: 2018, pensionableEarnings: 55900 },
      { year: 2019, pensionableEarnings: 57400 },
      { year: 2021, pensionableEarnings: 61600 },
      { year: 2023, pensionableEarnings: 66600 },
    ]);
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
