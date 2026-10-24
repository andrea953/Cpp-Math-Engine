import { describe, expect, it } from "vitest";
import type { Scenario } from "@workspace/api-client-react";
import { buildClientIndex, searchClientIndex } from "../dashboard-search";

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
  {
    id: "4",
    title: "Different spelling",
    clientName: "lindsay brown",
    inputs: { birthYear: 1961 } as Scenario["inputs"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
  },
];

describe("client index and search", () => {
  it("shows one alphabetical client row with all of that client's scenarios", () => {
    const clients = buildClientIndex(scenarios);

    expect(clients.map((client) => client.clientName)).toEqual(["Lindsay Brown", "Morgan Lee"]);
    expect(clients[0].scenarios.map(({ id }) => id)).toEqual(["2", "4", "1"]);
    expect(clients[0].scenarios).toHaveLength(3);
  });

  it("matches a client name regardless of case and retains all client scenarios", () => {
    const clients = searchClientIndex(buildClientIndex(scenarios), "lInDsAy");

    expect(clients).toHaveLength(1);
    expect(clients[0].clientName).toBe("Lindsay Brown");
    expect(clients[0].matchingScenarios).toHaveLength(3);
  });

  it("matches an individual scenario title or birth year within the client row", () => {
    const clientIndex = buildClientIndex(scenarios);
    const titleMatch = searchClientIndex(clientIndex, "delay to 70");
    const birthYearMatch = searchClientIndex(clientIndex, "1958");

    expect(titleMatch).toHaveLength(1);
    expect(titleMatch[0].clientName).toBe("Lindsay Brown");
    expect(titleMatch[0].matchingScenarios.map(({ id }) => id)).toEqual(["2"]);
    expect(birthYearMatch[0].clientName).toBe("Morgan Lee");
    expect(birthYearMatch[0].matchingScenarios.map(({ id }) => id)).toEqual(["3"]);
  });

  it("returns every client for a blank query and no clients for an unmatched query", () => {
    const clientIndex = buildClientIndex(scenarios);

    expect(searchClientIndex(clientIndex, "  ")).toHaveLength(2);
    expect(searchClientIndex(clientIndex, "not a client")).toEqual([]);
  });
});
