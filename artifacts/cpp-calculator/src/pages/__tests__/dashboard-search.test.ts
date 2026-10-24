import { describe, expect, it } from "vitest";
import type { Scenario } from "@workspace/api-client-react";
import { filterScenarios } from "../dashboard-search";

const scenarios: Scenario[] = [
  {
    id: "1",
    title: "Retire at 65",
    clientName: "Lindsay Brown",
    inputs: { birthYear: 1961 } as Scenario["inputs"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "2",
    title: "Delay to 70",
    clientName: "Lindsay Brown",
    inputs: { birthYear: 1961 } as Scenario["inputs"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "3",
    title: "Retire early",
    clientName: "Morgan Lee",
    inputs: { birthYear: 1958 } as Scenario["inputs"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  },
];

describe("dashboard client and scenario search", () => {
  it("returns all scenarios when the search is blank", () => {
    expect(filterScenarios(scenarios, "  ")).toEqual(scenarios);
  });

  it("matches client names without regard to case and keeps all that client's scenarios", () => {
    expect(filterScenarios(scenarios, "lInDsAy")).toEqual(scenarios.slice(0, 2));
  });

  it("matches scenario titles and birth years", () => {
    expect(filterScenarios(scenarios, "delay to 70").map(({ id }) => id)).toEqual(["2"]);
    expect(filterScenarios(scenarios, "1958").map(({ id }) => id)).toEqual(["3"]);
  });

  it("returns no results for an unmatched query", () => {
    expect(filterScenarios(scenarios, "not a client")).toEqual([]);
  });
});
