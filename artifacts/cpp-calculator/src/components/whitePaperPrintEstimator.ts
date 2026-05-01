/**
 * Page-count estimator for the Safari/Firefox print fallback in
 * `useCrossBrowserPrintMargins` (white-paper.tsx).
 *
 * Extracted into its own module so two callers can use the same code:
 *   1. `useCrossBrowserPrintMargins` — at print time, to decide how many
 *      "Page N of M" footer DOM elements to inject for browsers that
 *      don't support `@page` margin boxes.
 *   2. The cross-browser e2e test (`whitePaperPrint.e2e.test.ts`) — to
 *      compare the JS estimate against Chromium's real `page.pdf()`
 *      page count and prove the two agree.
 *
 * This file is intentionally narrow: pure DOM reads, no React, no
 * window/navigator side-effects. All geometry is parameterized so the
 * caller controls the print-stylesheet constants.
 */

export interface PrintGeometry {
  /**
   * Vertical print area inside the @page top/bottom margins, in CSS
   * pixels at 96 DPI. For Letter with `margin: 0.7in 0.6in 0.8in 0.6in`
   * this is `(11 - 0.7 - 0.8) * 96 = 9.5 * 96 = 912 px`.
   */
  pageContentPx: number;
  /**
   * Horizontal print area inside the @page left/right margins, in CSS
   * pixels at 96 DPI. For Letter with the same margins this is
   * `(8.5 - 0.6 - 0.6) * 96 = 7.3 * 96 = 700.8 px`.
   */
  printWidthPx: number;
}

/**
 * Estimate how many printed pages the white paper occupies by cloning
 * its DOM root, forcing the clone to lay out at the print width and
 * font size, and counting page-sized vertical chunks. Forced page
 * breaks at every non-first `.print-part-heading` are honoured (matching
 * the `:first-of-type { page-break-before: auto }` rule in index.css).
 *
 * Three layout effects are deliberately not modelled (they would
 * require the actual print pipeline to compute exactly):
 *
 *   - `page-break-inside: avoid` blocks (`.print-formula`,
 *     `.print-section-heading`, `ul`/`ol`) that get pushed to the next
 *     page when they don't fit at the bottom of the current page,
 *   - orphan / widow rules on `<p>` and `<li>` (3-line minimum at the
 *     top and bottom of a page),
 *   - sub-pixel font-metric differences between the screen and print
 *     layout pipelines.
 *
 * Together these effects can shift the printed page count by ±1 from
 * this estimate. The companion test in `whitePaperPrint.e2e.test.ts`
 * is what bounds the total drift against Chromium's actual
 * `Page.printToPDF` page count, and the snapshot test in
 * `whitePaperPrintEstimator.test.ts` catches structural drift in this
 * function's formula.
 */
export function estimateWhitePaperPageCount(
  rootEl: HTMLElement,
  geom: PrintGeometry,
): number {
  const clone = rootEl.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    position: "absolute",
    left: "-99999px",
    top: "0",
    width: `${geom.printWidthPx}px`,
    maxWidth: `${geom.printWidthPx}px`,
    fontSize: "11pt",
    lineHeight: "1.45",
    boxSizing: "border-box",
    padding: "0",
    margin: "0",
    background: "#fff",
  } as CSSStyleDeclaration);
  const innerSelector =
    'article, [class*="max-w-"], [class*="px-"], [class*="py-"]';
  clone.querySelectorAll<HTMLElement>(innerSelector).forEach((el) => {
    el.style.maxWidth = "none";
    el.style.width = "100%";
    el.style.paddingLeft = "0";
    el.style.paddingRight = "0";
  });

  document.body.appendChild(clone);

  const cloneTop = clone.getBoundingClientRect().top;
  const partHeadings = Array.from(
    clone.querySelectorAll<HTMLElement>(".print-part-heading"),
  );
  const breakOffsets: number[] = [0];
  partHeadings.forEach((h, i) => {
    if (i === 0) return;
    breakOffsets.push(h.getBoundingClientRect().top - cloneTop);
  });
  breakOffsets.push(clone.scrollHeight);

  // Model `page-break-inside: avoid` overflow: when a keep-together block
  // (formulas, section headings, ul/ol) doesn't fit at the bottom of the
  // current page, the print pipeline pushes it to the next page, leaving
  // the unused tail of the current page as slack. The base estimator only
  // sums raw heights, so without this adjustment it under-counts whenever
  // keep-together blocks straddle page boundaries.
  const keepTogetherSelector =
    ".print-formula, .print-section-heading, ul, ol";
  const keepTogether = Array.from(
    clone.querySelectorAll<HTMLElement>(keepTogetherSelector),
  ).map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top - cloneTop,
      height: Math.min(rect.height, geom.pageContentPx),
    };
  });

  let pages = 0;
  for (let i = 0; i < breakOffsets.length - 1; i++) {
    const segStart = breakOffsets[i];
    const segHeight = breakOffsets[i + 1] - segStart;
    if (segHeight <= 0) continue;

    // Walk keep-together blocks in this segment in document order; if a
    // block crosses a page boundary, snap the running cursor to the next
    // boundary (modelling the push-to-next-page).
    const blocksInSeg = keepTogether
      .filter((b) => b.top >= segStart && b.top < segStart + segHeight)
      .sort((a, b) => a.top - b.top);

    let slack = 0;
    for (const b of blocksInSeg) {
      const yInSeg = b.top - segStart + slack;
      const pageOffset = yInSeg % geom.pageContentPx;
      if (pageOffset + b.height > geom.pageContentPx) {
        slack += geom.pageContentPx - pageOffset;
      }
    }
    pages += Math.max(1, Math.ceil((segHeight + slack) / geom.pageContentPx));
  }

  document.body.removeChild(clone);
  return Math.max(1, pages);
}
