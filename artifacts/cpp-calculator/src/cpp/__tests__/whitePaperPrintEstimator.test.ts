/**
 * Drift guard for the Safari/Firefox print "Page N of M" footer.
 *
 * Chrome and Edge render the running header and footer through the
 * `@page @top-left` / `@bottom-right` margin boxes defined in
 * `src/index.css`, so their printed page count is always exactly right.
 * Safari and Firefox ignore those margin boxes, so
 * `useCrossBrowserPrintMargins` in `src/components/white-paper.tsx`
 * estimates the total page count from an offscreen DOM clone using
 * Letter-page geometry and accounts for forced page breaks at
 * `.print-part-heading`.
 *
 * NOTE: The companion test
 * `src/components/__tests__/whitePaperPrint.e2e.test.ts` (run via
 * `pnpm test:e2e`) actually paginates the white paper in headless
 * Chromium via `Page.printToPDF` and asserts the estimator agrees with
 * the real page count exactly. THIS file is a fast structural
 * pre-flight that runs in the regular `pnpm test` loop without needing
 * a Chromium binary.
 *
 * That estimator deliberately ignores three sources of layout shift
 * because they are content-dependent and hard to model from a screen
 * clone:
 *
 *   1. `page-break-inside: avoid` blocks (`.print-formula`,
 *      `.print-section-heading`, `ul`/`ol`) that get pushed to the next
 *      page when they don't fit at the bottom of the current page.
 *   2. orphan / widow rules on `<p>` and `<li>`.
 *   3. font-metric differences between the screen layout pipeline and
 *      the print pipeline.
 *
 * In typical content these net out within ±1 page. But if the white
 * paper grows materially (longer sections, more `<Formula>` blocks,
 * more `<PartHeading>`s, looser margins, a different print font size),
 * the estimate can silently drift, and the symptom is bad: Firefox /
 * Safari print "Page 7 of 8" on a phantom blank page, or skip the
 * footer entirely on the last page, while Chrome stays correct via its
 * native `@page` counters.
 *
 * This test snapshots a fingerprint of every input the estimator's
 * accuracy depends on:
 *
 *   - block counts (`<PartHeading>`, `<SectionHeading>`, `<Formula>`,
 *     `<Example>`, `<ExampleLine>`, `<InlineMath>`, `<li>`, `<p>`),
 *   - the bucketed length of visible body text in the source,
 *   - the estimator's geometry constants (`PAGE_CONTENT_PX`,
 *     `PRINT_WIDTH_PX`),
 *   - the `@page` margin and the `body { font-size, line-height }` rule
 *     used by the print stylesheet.
 *
 * When this snapshot fails, the white paper or its print geometry has
 * changed in a way that could push the estimator off by a page in
 * Safari or Firefox. The fix is:
 *
 *   1. Print the white paper from BOTH Safari and Firefox and confirm
 *      the injected "Page N of M" footers match the actual rendered
 *      page count and land on real (not phantom blank) pages.
 *   2. If they drift, tune `estimatePageCount` in `white-paper.tsx`
 *      (e.g. account for `.print-formula` / `.print-section-heading`
 *      avoid-break overflow, or adjust `PAGE_CONTENT_PX` for the new
 *      content).
 *   3. Once Safari and Firefox print correctly, run
 *      `pnpm --filter @workspace/cpp-calculator test -u` to bake in
 *      the new fingerprint.
 *
 * Chrome's printed output is NOT what this test guards — Chrome uses
 * native `counter(pages)` and is always right. This test guards the
 * Safari / Firefox fallback path only.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readArtifactFile(relPath: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.resolve(here, "..", "..", relPath), "utf8");
}

function countMatches(source: string, pattern: RegExp): number {
  return (source.match(pattern) ?? []).length;
}

/**
 * Approximate the visible body text length of the white paper by
 * stripping JSX expressions (curlies) and JSX tags. The result is
 * bucketed to the nearest 250 characters so harmless edits (a single
 * comma or a renamed prop) don't flap the snapshot, while a meaningful
 * content addition (a new sentence, a new bullet) shifts the bucket.
 */
function visibleTextLengthBucket(source: string, bucket: number): number {
  let text = source;
  // Strip nested JSX expressions a few passes deep. White paper data
  // is interpolated via `{ex.foo}`, which we don't want counted as
  // body text since it varies with `whitePaperExamples` constants.
  for (let i = 0; i < 4; i++) {
    text = text.replace(/\{[^{}]*\}/g, "");
  }
  text = text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Math.round(text.length / bucket) * bucket;
}

function pickConst(source: string, name: string): string | null {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`);
  const m = source.match(re);
  return m ? m[1].trim() : null;
}

function pickFirstCapture(source: string, re: RegExp): string | null {
  const m = source.match(re);
  return m ? m[1].trim() : null;
}

describe("Safari / Firefox print page-count estimator drift guard", () => {
  it("white-paper content + print geometry fingerprint is unchanged", () => {
    const wp = readArtifactFile("components/white-paper.tsx");
    const css = readArtifactFile("index.css");

    const fingerprint = {
      // ---- Block counts the estimator's accuracy depends on ----
      // Forced page breaks (every PartHeading after the first).
      partHeadings: countMatches(wp, /<PartHeading\b/g),
      // `page-break-inside: avoid` containers — drift sources #1.
      sectionHeadings: countMatches(wp, /<SectionHeading\b/g),
      formulas: countMatches(wp, /<Formula>/g),
      // Free-text body blocks — drift sources #2 (orphans/widows) and
      // #3 (font metrics) scale with these.
      examples: countMatches(wp, /<Example[\s>]/g),
      exampleLines: countMatches(wp, /<ExampleLine>/g),
      inlineMaths: countMatches(wp, /<InlineMath>/g),
      listItems: countMatches(wp, /<li[\s>]/g),
      paragraphs: countMatches(wp, /<p[\s>]/g),
      // Total visible body text bucketed to nearest 250 chars (≈ a
      // small paragraph). A new section will move this; a punctuation
      // tweak will not.
      visibleTextLengthBucket: visibleTextLengthBucket(wp, 250),

      // ---- Estimator geometry constants ----
      // If these change in white-paper.tsx, the per-page Y offset
      // changes and the footer/header injection moves with it.
      pageContentPxExpr: pickConst(wp, "PAGE_CONTENT_PX"),
      printWidthPxExpr: pickConst(wp, "PRINT_WIDTH_PX"),

      // ---- Print stylesheet geometry ----
      // The estimator assumes these match the @media print rules. If
      // either the @page margin or the body font/line metrics change,
      // the JS-derived PAGE_CONTENT_PX must be retuned.
      pageMargin: pickFirstCapture(
        css,
        /@page\s*\{\s*size:\s*letter;\s*margin:\s*([^;]+);/,
      ),
      bodyFontSize: pickFirstCapture(
        css,
        /@media print[\s\S]*?body\s*\{[^}]*font-size:\s*([^;]+);/,
      ),
      bodyLineHeight: pickFirstCapture(
        css,
        /@media print[\s\S]*?body\s*\{[^}]*line-height:\s*([^;]+);/,
      ),
    };

    expect(fingerprint).toMatchInlineSnapshot(`
      {
        "bodyFontSize": "11pt",
        "bodyLineHeight": "1.45",
        "exampleLines": 50,
        "examples": 17,
        "formulas": 12,
        "inlineMaths": 22,
        "listItems": 83,
        "pageContentPxExpr": "9.5 * 96",
        "pageMargin": "0.7in 0.6in 0.8in 0.6in",
        "paragraphs": 61,
        "partHeadings": 2,
        "printWidthPxExpr": "7.3 * 96",
        "sectionHeadings": 19,
        "visibleTextLengthBucket": 4250,
      }
    `);
  });
});
