/**
 * Guard: every note/warning string the engine can emit must have a
 * plain-language translation for the printed client report.
 *
 * The printed handout runs engine messages through
 * `src/components/editor/print-plain-language.ts`. Its fallback prints the
 * ORIGINAL technical text, so a new engine message without a translation
 * silently puts actuary-speak back on the client PDF.
 *
 * This test statically enumerates every string/template literal pushed into
 * `notes` / `warnings` in `src/cpp/survivor.ts` and `src/cpp/calculate.ts`
 * (including ternary branches and inline `warnings: [...]` literals),
 * instantiates each template with representative values, and asserts the
 * translator rewrites it (does not fall back). It also cross-checks against
 * live engine runs that exercise the note-producing code paths.
 *
 * If this test fails: add a matching entry to
 * `src/components/editor/print-plain-language.ts`.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  translateSurvivorNote,
  translateWarning,
} from "../../components/editor/print-plain-language";
import { calculateCpp } from "../calculate";
import { calculateSurvivor, buildDefaultSurvivorInputs } from "../survivor";
import type { ScenarioInputs } from "../types";

const CPP_DIR = join(__dirname, "..");

/**
 * Extract every string/template literal that appears inside the argument
 * list of `<collector>.push(...)` calls or inline `<collector>: [...]`
 * array literals in the given source text.
 */
function extractMessages(source: string, collector: "notes" | "warnings"): string[] {
  const messages: string[] = [];
  const openers = [`${collector}.push(`, `${collector}: [`];
  for (const opener of openers) {
    let from = 0;
    for (;;) {
      const start = source.indexOf(opener, from);
      if (start === -1) break;
      const openChar = opener.endsWith("(") ? "(" : "[";
      const closeChar = openChar === "(" ? ")" : "]";
      // Scan to the matching close, respecting string literals.
      let depth = 1;
      let i = start + opener.length;
      let inString: string | null = null; // quote char when inside a literal
      const argStart = i;
      while (i < source.length && depth > 0) {
        const ch = source[i];
        if (inString) {
          if (ch === "\\") i += 1; // skip escaped char
          else if (ch === inString) inString = null;
        } else if (ch === '"' || ch === "'" || ch === "`") {
          inString = ch;
        } else if (ch === openChar) depth += 1;
        else if (ch === closeChar) depth -= 1;
        i += 1;
      }
      const arg = source.slice(argStart, i - 1);
      messages.push(...extractLiterals(arg));
      from = i;
    }
  }
  return messages;
}

/** Pull every top-level string/template literal out of an expression. */
function extractLiterals(expr: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      let raw = "";
      while (j < expr.length) {
        const c = expr[j];
        if (c === "\\") {
          raw += expr[j + 1];
          j += 2;
          continue;
        }
        if (c === quote) break;
        if (quote === "`" && c === "$" && expr[j + 1] === "{") {
          // Skip the interpolation, respecting nesting and nested strings.
          let depth = 1;
          let k = j + 2;
          let inner: string | null = null;
          while (k < expr.length && depth > 0) {
            const d = expr[k];
            if (inner) {
              if (d === "\\") k += 1;
              else if (d === inner) inner = null;
            } else if (d === '"' || d === "'" || d === "`") inner = d;
            else if (d === "{") depth += 1;
            else if (d === "}") depth -= 1;
            k += 1;
          }
          raw += "\u0000"; // placeholder marker
          j = k;
          continue;
        }
        raw += c;
        j += 1;
      }
      out.push(raw);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out;
}

/**
 * Instantiate a template by replacing each interpolation marker with a
 * representative numeric value ("2025" satisfies \d{4}, \d+, [\d.,]+ and
 * [\d,]+ in the translation regexes).
 */
function instantiate(template: string): string {
  return template.replaceAll("\u0000", "2025");
}

const survivorSource = readFileSync(join(CPP_DIR, "survivor.ts"), "utf8");
const calculateSource = readFileSync(join(CPP_DIR, "calculate.ts"), "utf8");

function failureHint(kind: string, message: string): string {
  return (
    `Engine ${kind} has no plain-language translation and would print raw ` +
    `technical text on the client report:\n  "${message}"\n` +
    `Add a matching entry in src/components/editor/print-plain-language.ts.`
  );
}

describe("print plain-language coverage (static enumeration)", () => {
  const survivorNotes = extractMessages(survivorSource, "notes").filter((m) => m.length > 0);
  const warnings = [
    ...extractMessages(calculateSource, "warnings"),
    ...extractMessages(survivorSource, "warnings"),
  ].filter((m) => m.length > 0);

  it("finds the survivor note emission sites", () => {
    // If this drops to zero the extraction regressed (or notes moved) —
    // the coverage guarantee would silently vanish.
    expect(survivorNotes.length).toBeGreaterThanOrEqual(9);
  });

  it("finds the calculator warning emission sites", () => {
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });

  it.each(survivorNotes.map((m) => [instantiate(m)]))(
    "translates survivor note: %s",
    (message) => {
      expect(translateSurvivorNote(message), failureHint("survivor note", message)).not.toBe(
        message,
      );
    },
  );

  it.each(warnings.map((m) => [instantiate(m)]))(
    "translates calculator warning: %s",
    (message) => {
      expect(translateWarning(message), failureHint("warning", message)).not.toBe(message);
    },
  );
});

// ---------------------------------------------------------------------------
// Live cross-check: exercise the engine paths that emit notes/warnings and
// assert the real emitted strings translate too. This catches messages built
// in ways the static scan can't see (e.g. helper functions returning text).
// ---------------------------------------------------------------------------

function baseInputs(overrides: Partial<ScenarioInputs> = {}): ScenarioInputs {
  return {
    birthYear: 1980,
    birthMonth: 6,
    startAges: [65],
    earningsHistory: [
      { year: 2000, pensionableEarnings: 40000 },
      { year: 2001, pensionableEarnings: 42000 },
      { year: 2002, pensionableEarnings: 44000 },
    ],
    dropoutPeriods: [],
    assumptions: {
      stopWorkAge: 60,
      assumedFutureEarnings: 0,
      futureEarningsGrowthRate: 0,
      indexingRate: 0.02,
      ympeGrowthRate: 0.03,
      yampeGrowthRate: 0.03,
    },
    ...overrides,
  } as ScenarioInputs;
}

function collectLiveMessages(): { warnings: string[]; notes: string[] } {
  const warnings: string[] = [];
  const notes: string[] = [];

  // Warnings
  warnings.push(...calculateCpp(baseInputs({ startAges: [] })).warnings);
  warnings.push(...calculateCpp(baseInputs({ birthYear: 1850 })).warnings);
  warnings.push(
    ...calculateCpp(
      baseInputs({
        earningsHistory: [{ year: 2000, pensionableEarnings: -5 }],
      }),
    ).warnings,
  );

  const survivorBase = {
    ...buildDefaultSurvivorInputs(2026),
    enabled: true,
  };

  // No calculated retirement on file
  notes.push(
    ...calculateSurvivor(baseInputs({ earningsHistory: [] }), {
      ...survivorBase,
      startYear: 2026,
      survivorAge: 65,
    }).notes,
  );

  const scenario = baseInputs();

  // Early death (< 60) + top-up (survivor under 35, no children, not disabled, unknown receipt)
  notes.push(
    ...calculateSurvivor(scenario, { ...survivorBase, startYear: 2026, survivorAge: 30 }).notes,
  );
  // Top-up with known receipt status
  notes.push(
    ...calculateSurvivor(scenario, {
      ...survivorBase,
      startYear: 2026,
      survivorAge: 30,
      deceasedReceivedCppBenefits: false,
    }).notes,
  );
  // Under-45 reduction
  notes.push(
    ...calculateSurvivor(scenario, { ...survivorBase, startYear: 2026, survivorAge: 40 }).notes,
  );
  // Basic amount, "may apply" variant (death at 60+, unknown receipt, survivor ineligible)
  notes.push(
    ...calculateSurvivor(baseInputs({ birthYear: 1960 }), {
      ...survivorBase,
      startYear: 2026,
      survivorAge: 30,
    }).notes,
  );
  // Basic amount, does-not-apply variant (survivor eligible for pension)
  notes.push(
    ...calculateSurvivor(scenario, { ...survivorBase, startYear: 2026, survivorAge: 65 }).notes,
  );
  // Combined-benefit cap reduction
  notes.push(
    ...calculateSurvivor(scenario, {
      ...survivorBase,
      startYear: 2026,
      survivorAge: 66,
      survivorOwnBaseTier1Monthly: 100000,
    }).notes,
  );

  return { warnings, notes };
}

describe("print plain-language coverage (live engine messages)", () => {
  const { warnings, notes } = collectLiveMessages();

  it("live paths emit the expected variety of messages", () => {
    expect(warnings.length).toBeGreaterThanOrEqual(3);
    expect(notes.length).toBeGreaterThanOrEqual(6);
  });

  it.each([...new Set(warnings)].map((m) => [m]))(
    "translates live warning: %s",
    (message) => {
      expect(translateWarning(message), failureHint("warning", message)).not.toBe(message);
    },
  );

  it.each([...new Set(notes)].map((m) => [m]))(
    "translates live survivor note: %s",
    (message) => {
      expect(translateSurvivorNote(message), failureHint("survivor note", message)).not.toBe(
        message,
      );
    },
  );
});
