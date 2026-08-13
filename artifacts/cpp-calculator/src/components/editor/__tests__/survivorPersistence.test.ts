import { describe, it, expect } from "vitest";
import {
  CreateScenarioBody,
  UpdateScenarioBody,
  GetScenarioResponse,
} from "@workspace/api-zod";
import {
  deceasedReceivedToSelectValue,
  selectValueToDeceasedReceived,
} from "../survivor-select-content";

/**
 * Task: confirm the three-state `deceasedReceivedCppBenefits` survivor input
 * (undefined = unknown / true = yes / false = no) survives a scenario
 * save → reload round-trip WITHOUT silent coercion.
 *
 * The persistence pipeline is:
 *   client JSON → CreateScenarioBody/UpdateScenarioBody zod parse (api-server)
 *   → Postgres JSONB column (drizzle serializes via JSON.stringify)
 *   → row read back → GetScenarioResponse shape → client
 *
 * The JSONB leg is faithfully modeled by JSON.stringify/JSON.parse: an
 * `undefined` (unknown) value means the key is simply absent from the stored
 * JSON, while an explicit `false` (no) is stored as a JSON false. A silent
 * coercion at any zod boundary (e.g. a default, or optional() being lost)
 * would collapse the two — and quietly change the $2,500 death-benefit
 * top-up on a client's numbers.
 */

function baseSurvivor(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    startYear: 2026,
    survivorAge: 58,
    hasDependentChildren: false,
    survivorDisabled: false,
    numEligibleChildren: 0,
    survivorOwnBaseTier1Monthly: 0,
    survivorOwnTier2Monthly: 0,
    ...overrides,
  };
}

function baseScenarioBody(survivor: Record<string, unknown>) {
  return {
    title: "Round-trip check",
    inputs: {
      birthYear: 1968,
      birthMonth: 4,
      earningsHistory: [{ year: 1990, pensionableEarnings: 28900 }],
      assumptions: {
        ympeGrowthRate: 0.031,
        yampeGrowthRate: 0.031,
        indexingRate: 0.021,
        futureEarningsGrowthRate: 0.03,
        assumedFutureEarnings: 65000,
        stopWorkAge: 65,
      },
      startAges: [65],
      survivor,
    },
  };
}

/** Simulates the JSONB column: what drizzle stores and reads back. */
function jsonbRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type ParsedSurvivor = {
  deceasedReceivedCppBenefits?: boolean;
};

function saveAndReload(
  body: ReturnType<typeof baseScenarioBody>,
  schema: typeof CreateScenarioBody | typeof UpdateScenarioBody,
): ParsedSurvivor {
  // 1. API server validates the incoming body.
  const parsed = schema.parse(body);
  // 2. `inputs` is written to (and later read from) the JSONB column.
  const stored = jsonbRoundTrip(parsed.inputs);
  // 3. The GET response returns the stored inputs; validate the full
  //    response shape the client's reload path consumes.
  const response = GetScenarioResponse.parse({
    id: "s1",
    title: parsed.title,
    inputs: stored,
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  });
  return (response.inputs.survivor ?? {}) as ParsedSurvivor;
}

describe("deceasedReceivedCppBenefits save → reload round-trip", () => {
  for (const schema of [CreateScenarioBody, UpdateScenarioBody]) {
    const name = schema === CreateScenarioBody ? "create" : "update";

    it(`${name}: untouched "Unknown" stays absent (undefined), not coerced`, () => {
      // Untouched selector: the key is never set on the survivor object.
      const survivor = saveAndReload(baseScenarioBody(baseSurvivor()), schema);
      expect("deceasedReceivedCppBenefits" in survivor).toBe(false);
      expect(survivor.deceasedReceivedCppBenefits).toBeUndefined();
    });

    it(`${name}: explicit "No" (false) persists distinctly from unknown`, () => {
      const survivor = saveAndReload(
        baseScenarioBody(baseSurvivor({ deceasedReceivedCppBenefits: false })),
        schema,
      );
      expect("deceasedReceivedCppBenefits" in survivor).toBe(true);
      expect(survivor.deceasedReceivedCppBenefits).toBe(false);
    });

    it(`${name}: explicit "Yes" (true) persists`, () => {
      const survivor = saveAndReload(
        baseScenarioBody(baseSurvivor({ deceasedReceivedCppBenefits: true })),
        schema,
      );
      expect(survivor.deceasedReceivedCppBenefits).toBe(true);
    });
  }

  it("client-side JSON serialization drops the key for unknown (fetch body fidelity)", () => {
    // The browser sends JSON.stringify(inputs); undefined must serialize to
    // an ABSENT key, never to null or false.
    const wire = JSON.parse(
      JSON.stringify(baseSurvivor({ deceasedReceivedCppBenefits: undefined })),
    );
    expect("deceasedReceivedCppBenefits" in wire).toBe(false);
  });
});

describe("survivor panel selector reflects the persisted value", () => {
  it("maps persisted values to the three select states", () => {
    expect(deceasedReceivedToSelectValue(undefined)).toBe("unknown");
    expect(deceasedReceivedToSelectValue(true)).toBe("yes");
    expect(deceasedReceivedToSelectValue(false)).toBe("no");
  });

  it("maps select choices back to the persisted representation", () => {
    expect(selectValueToDeceasedReceived("unknown")).toBeUndefined();
    expect(selectValueToDeceasedReceived("yes")).toBe(true);
    expect(selectValueToDeceasedReceived("no")).toBe(false);
  });

  it("round-trips selector → persistence → selector for every state", () => {
    for (const state of ["unknown", "yes", "no"] as const) {
      const persisted = selectValueToDeceasedReceived(state);
      // Through the full save/reload pipeline:
      const survivor = (() => {
        const body = baseScenarioBody(
          persisted === undefined
            ? baseSurvivor()
            : baseSurvivor({ deceasedReceivedCppBenefits: persisted }),
        );
        const parsed = CreateScenarioBody.parse(body);
        return JSON.parse(JSON.stringify(parsed.inputs)).survivor as ParsedSurvivor;
      })();
      expect(deceasedReceivedToSelectValue(survivor.deceasedReceivedCppBenefits)).toBe(state);
    }
  });
});
