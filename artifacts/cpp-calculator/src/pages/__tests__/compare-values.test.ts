import { describe, expect, it } from "vitest";
import { toTodaysDollars } from "../compare-values";

describe("toTodaysDollars", () => {
  it("leaves current-year and next-year amounts unchanged", () => {
    expect(toTodaysDollars(1000, 2026, 2026, 0.02)).toBe(1000);
    expect(toTodaysDollars(1000, 2027, 2026, 0.02)).toBe(1000);
  });

  it("deflates later amounts using the scenario's indexing assumption", () => {
    expect(toTodaysDollars(1020, 2028, 2026, 0.02)).toBeCloseTo(1000);
  });

  it("supports zero indexing without changing values", () => {
    expect(toTodaysDollars(1500, 2040, 2026, 0)).toBe(1500);
  });
});
