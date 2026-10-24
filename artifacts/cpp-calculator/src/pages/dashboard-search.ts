import type { Scenario } from "@workspace/api-client-react";

export function filterScenarios(scenarios: Scenario[], searchTerm: string): Scenario[] {
  const terms = searchTerm.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return scenarios;

  return scenarios.filter((scenario) => {
    const searchableText = [
      scenario.clientName,
      scenario.title,
      scenario.inputs.birthYear,
    ]
      .filter((value) => value !== undefined && value !== null)
      .join(" ")
      .toLocaleLowerCase();

    return terms.every((term) => searchableText.includes(term));
  });
}
