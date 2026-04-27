/**
 * Adjustment-factor tests.
 *
 * Reference: Service Canada — "When to start your retirement pension"
 *  - Early take-up: -0.6% per month for each month before age 65 (max -36% at 60)
 *  - Late take-up:  +0.7% per month for each month after age 65 (max +42% at 70)
 */
import { describe, expect, it } from "vitest";
import { computeAdjustmentFactor } from "../calculate";

describe("computeAdjustmentFactor", () => {
  it("is exactly 1.00 at age 65", () => {
    expect(computeAdjustmentFactor(65)).toBe(1);
  });

  it("is exactly 0.64 at age 60 (-36% from 60 months early)", () => {
    expect(computeAdjustmentFactor(60)).toBeCloseTo(0.64, 10);
  });

  it("is exactly 1.42 at age 70 (+42% from 60 months late)", () => {
    expect(computeAdjustmentFactor(70)).toBeCloseTo(1.42, 10);
  });

  it("computes fractional ages correctly", () => {
    // 60.5 = 54 months early = 1 - 54*0.006 = 0.676
    expect(computeAdjustmentFactor(60.5)).toBeCloseTo(0.676, 10);
    // 67.25 = 27 months late = 1 + 27*0.007 = 1.189
    expect(computeAdjustmentFactor(67.25)).toBeCloseTo(1.189, 10);
    // 69.75 = 57 months late = 1 + 57*0.007 = 1.399
    expect(computeAdjustmentFactor(69.75)).toBeCloseTo(1.399, 10);
  });

  it("clamps ages below 60 to the minimum (= factor at 60)", () => {
    expect(computeAdjustmentFactor(55)).toBeCloseTo(0.64, 10);
    expect(computeAdjustmentFactor(0)).toBeCloseTo(0.64, 10);
  });

  it("clamps ages above 70 to the maximum (= factor at 70)", () => {
    expect(computeAdjustmentFactor(75)).toBeCloseTo(1.42, 10);
    expect(computeAdjustmentFactor(120)).toBeCloseTo(1.42, 10);
  });
});
