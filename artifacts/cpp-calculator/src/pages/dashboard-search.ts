import type { Scenario } from "@workspace/api-client-react";

export interface ClientIndexRow {
  /** Empty when these scenarios have no client assigned. */
  clientName: string;
  scenarios: Scenario[];
  matchingScenarios: Scenario[];
}

function searchTerms(searchTerm: string): string[] {
  return searchTerm.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

function matchesEveryTerm(text: string, terms: string[]): boolean {
  const normalizedText = text.toLocaleLowerCase();
  return terms.every((term) => normalizedText.includes(term));
}

export function buildClientIndex(scenarios: Scenario[]): ClientIndexRow[] {
  const groups = new Map<string, ClientIndexRow>();

  for (const scenario of scenarios) {
    const clientName = scenario.clientName?.trim() ?? "";
    const key = clientName.toLocaleLowerCase();
    const group = groups.get(key) ?? {
      clientName,
      scenarios: [],
      matchingScenarios: [],
    };
    group.scenarios.push(scenario);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      scenarios: [...group.scenarios].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      ),
      matchingScenarios: [...group.scenarios],
    }))
    .sort((a, b) => {
      if (!a.clientName) return 1;
      if (!b.clientName) return -1;
      return a.clientName.localeCompare(b.clientName, undefined, { sensitivity: "base" });
    });
}

export function searchClientIndex(
  clients: ClientIndexRow[],
  searchTerm: string,
): ClientIndexRow[] {
  const terms = searchTerms(searchTerm);
  if (terms.length === 0) return clients;

  return clients.flatMap((client) => {
    const clientMatches = matchesEveryTerm(client.clientName, terms);
    const scenarioMatches = client.scenarios.filter((scenario) =>
      matchesEveryTerm(
        `${scenario.clientName ?? ""} ${scenario.title} ${scenario.inputs.birthYear}`,
        terms,
      ),
    );
    const matchingScenarios = clientMatches ? client.scenarios : scenarioMatches;

    return matchingScenarios.length > 0
      ? [{ ...client, matchingScenarios }]
      : [];
  });
}
