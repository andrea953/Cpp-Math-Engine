import { describe, it, expect } from "vitest";
import { buildApplicationBlocks } from "../application-checklist-content";
import type { DropoutPeriod, ScenarioInputs } from "@/cpp";

const period = (kind: DropoutPeriod["kind"]): DropoutPeriod => ({
  kind,
  startYear: 2020,
  startMonth: 1,
  endYear: 2021,
  endMonth: 12,
});

// buildApplicationBlocks only reads inputs.dropoutPeriods, so a minimal shape
// is sufficient for these behavioral assertions.
const inputsWith = (periods: DropoutPeriod[]): ScenarioInputs =>
  ({ dropoutPeriods: periods }) as unknown as ScenarioInputs;

describe("buildApplicationBlocks", () => {
  it("returns no blocks when there are no dropout periods", () => {
    expect(buildApplicationBlocks(inputsWith([]))).toHaveLength(0);
    expect(buildApplicationBlocks({} as ScenarioInputs)).toHaveLength(0);
  });

  it("includes only the child-rearing block for CRDO-only scenarios", () => {
    const blocks = buildApplicationBlocks(inputsWith([period("crdo")]));
    expect(blocks.map((b) => b.heading)).toEqual(["Child-rearing provision"]);
  });

  it("includes only the disability block for disability-only scenarios", () => {
    const blocks = buildApplicationBlocks(inputsWith([period("disability")]));
    expect(blocks.map((b) => b.heading)).toEqual(["Period of disability"]);
  });

  it("includes both blocks (child-rearing first) when both kinds are present", () => {
    const blocks = buildApplicationBlocks(
      inputsWith([period("disability"), period("crdo")]),
    );
    expect(blocks.map((b) => b.heading)).toEqual([
      "Child-rearing provision",
      "Period of disability",
    ]);
  });
});
