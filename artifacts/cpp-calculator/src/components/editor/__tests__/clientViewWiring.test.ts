/**
 * Guardrail: the shared client link must keep plain-language wording.
 *
 * The pure translation/label logic is already covered by
 * printPlainLanguage.test.ts and clientViewContent.test.ts. What those tests
 * cannot catch is the *wiring*: a refactor of results-panel.tsx could drop
 * the `clientView` prop or the translation calls, or shared.tsx could stop
 * passing `clientView`, and the client link would silently regress to
 * actuary wording with every unit test still green.
 *
 * Component modules can't be value-imported under the vitest config (the
 * @/ alias constraint), so this test asserts against the component source
 * text directly. The assertions are anchored on the specific call sites
 * that implement the client-view translation contract — if any of them
 * disappear, this test fails and points at the regression.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

describe("shared client page wiring", () => {
  const sharedSrc = read("../../../pages/shared.tsx");

  it("passes clientView to ResultsPanel", () => {
    // Matches `<ResultsPanel ... clientView ...>` (bare or ={true}) in JSX.
    expect(sharedSrc).toMatch(
      /<ResultsPanel\b[^>]*\bclientView\b(?!\s*=\s*\{?\s*false)/,
    );
  });
});

describe("ResultsPanel clientView translation contract", () => {
  const panelSrc = read("../results-panel.tsx");

  it("imports the plain-language translators and friendly-label helpers", () => {
    for (const name of [
      "translateWarning",
      "translateSurvivorNote",
      "warningsHeading",
      "survivorCardTitle",
      "survivorTileLabels",
      "prbHeadlineLabel",
      "prbSubtext",
      "resultsPanelSections",
      "comparisonChartSeries",
      "caregivingCreditNote",
    ]) {
      expect(panelSrc, `results-panel.tsx no longer imports ${name}`).toMatch(
        new RegExp(`import[\\s\\S]*?\\b${name}\\b[\\s\\S]*?from`),
      );
    }
  });

  it("runs engine warnings through translateWarning in client view", () => {
    expect(panelSrc).toMatch(/clientView\s*\?\s*translateWarning\(/);
    expect(panelSrc).toMatch(/warningsHeading\(clientView\)/);
  });

  it("runs survivor notes through translateSurvivorNote in client view", () => {
    expect(panelSrc).toMatch(/clientView\s*\?\s*translateSurvivorNote\(/);
  });

  it("uses the friendly family labels keyed off clientView", () => {
    expect(panelSrc).toMatch(/survivorCardTitle\(clientView/);
    expect(panelSrc).toMatch(/survivorTileLabels\(clientView\)\.pension/);
    expect(panelSrc).toMatch(/survivorTileLabels\(clientView\)\.deathBenefit/);
    expect(panelSrc).toMatch(/survivorTileLabels\(clientView\)\.children/);
  });

  it("uses the friendly PRB labels keyed off clientView", () => {
    expect(panelSrc).toMatch(/prbHeadlineLabel\(clientView/);
    expect(panelSrc).toMatch(/prbSubtext\(clientView/);
  });

  it("gates advisor-only sections through resultsPanelSections(clientView)", () => {
    expect(panelSrc).toMatch(/resultsPanelSections\(clientView\)/);
    expect(panelSrc).toMatch(/comparisonChartSeries\(clientView\)/);
  });
});
