/**
 * Cross-browser print page-count e2e test.
 *
 * Boots a real Vite dev server pointing at the dedicated whitepaper-only
 * entry (`whitepaper-e2e.html`), launches the system Chromium via
 * puppeteer-core, and asserts that:
 *
 *   1. `estimateWhitePaperPageCount` (the JS estimator that
 *      `useCrossBrowserPrintMargins` uses to inject "Page N of M"
 *      footers in Safari and Firefox) and
 *   2. the actual page count of `Page.printToPDF` rendered with the
 *      same Letter geometry the `@page` rule in `src/index.css`
 *      declares
 *
 * agree within `PAGE_COUNT_TOLERANCE` pages.
 *
 * Why this matters: Safari and Firefox ignore `@page` margin boxes, so
 * Modern CENTS injects per-page absolutely-positioned footers at body
 * Y = p * pageContentPx. If the JS estimator under- or over-counts,
 * those browsers print "Page 7 of 8" on a phantom blank page, or skip
 * the footer on the last page. Chrome stays correct via native
 * `counter(pages)` and is the source of truth this test compares
 * against.
 *
 * The companion content-fingerprint snapshot in
 * `whitePaperPrintEstimator.test.ts` is a fast structural drift guard;
 * this test is the real-browser truth check that proves the estimator's
 * formula still holds.
 *
 * Running: `pnpm --filter @workspace/cpp-calculator test:e2e`.
 * Requires the system `chromium` binary (`which chromium`) — install
 * via the Replit package-management skill if missing.
 */
import net from "node:net";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// puppeteer-core does NOT bundle a Chromium binary; it uses whatever
// `executablePath` / `PUPPETEER_EXECUTABLE_PATH` points at.
import puppeteer, { type Browser } from "puppeteer-core";
import { createServer, type ViteDevServer } from "vite";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..", "..", "..");
const E2E_ENTRY_PATH = "/whitepaper-e2e.html";

/**
 * Tolerance, in pages, between the JS estimate and Chromium's actual
 * `printToPDF` page count.
 *
 * The estimator (in `src/components/whitePaperPrintEstimator.ts`)
 * predicts the page count by laying the white paper out at
 * print-width / print-font-size and summing `ceil(segHeight /
 * pageContentPx)` across the segments delimited by
 * `.print-part-heading` forced breaks. It deliberately does NOT
 * model:
 *
 *   - `page-break-inside: avoid` blocks (`.print-formula`,
 *     `.print-section-heading`, `ul`/`ol`) being pushed wholesale to
 *     the next page when they don't fit at the bottom of the current
 *     page,
 *   - orphan / widow rules on `<p>` and `<li>` (3-line minimum at the
 *     top and bottom of a page),
 *   - sub-pixel font-metric differences between the screen and print
 *     layout pipelines.
 *
 * On the current white paper Chromium's actual `printToPDF` count
 * sits 1 page above the estimate (these unmodelled effects together
 * push one extra page). Tolerance is therefore set to 1 page. A
 * |delta| of 2 or more is a real bug — either the estimator no
 * longer predicts the print pipeline closely enough, or the white
 * paper added/removed an entire page's worth of content without an
 * accompanying estimator update — and Safari / Firefox would
 * mis-paginate the printed "Page N of M" footers. If the delta grows
 * beyond 1, fix the estimator (or the @page geometry in
 * `src/index.css`) before bumping this.
 */
const PAGE_COUNT_TOLERANCE = 1;

function resolveChromiumExecutable(): string {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    throw new Error(
      "Chromium binary not found. Install via the Replit package-management " +
        "skill (`installSystemDependencies({ packages: ['chromium'] })`) or " +
        "set PUPPETEER_EXECUTABLE_PATH to a chromium/google-chrome path.",
    );
  }
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function countPdfPages(pdfBytes: Uint8Array): Promise<number> {
  // pdfjs-dist's "legacy" build is the Node-friendly entry (the default
  // export targets browsers and pulls in DOMMatrix/Path2D shims).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    // Suppress noisy worker / cmaps warnings during the test run; we
    // only need the page count, not full text extraction.
    isEvalSupported: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

describe("cross-browser print page-count e2e", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let port: number;

  beforeAll(async () => {
    port = await getFreePort();
    // The cpp-calculator vite config requires PORT and BASE_PATH from
    // env. VITE_CLERK_PUBLISHABLE_KEY isn't read by this entry (no
    // App.tsx import), but provide a dummy value in case any future
    // shared module reads it during initial transform.
    process.env.PORT = String(port);
    process.env.BASE_PATH = "/";
    process.env.VITE_CLERK_PUBLISHABLE_KEY ||= "pk_test_e2e_dummy";

    server = await createServer({
      configFile: path.resolve(PACKAGE_ROOT, "vite.config.ts"),
      root: PACKAGE_ROOT,
      server: {
        port,
        strictPort: true,
        host: "127.0.0.1",
      },
      // We don't care about the runtime-error overlay or HMR for the
      // single page-load this test does.
      clearScreen: false,
      logLevel: "warn",
    });
    await server.listen();

    browser = await puppeteer.launch({
      executablePath: resolveChromiumExecutable(),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }, 120_000);

  afterAll(async () => {
    await browser?.close().catch(() => undefined);
    await server?.close().catch(() => undefined);
  });

  it("estimateWhitePaperPageCount agrees with Chromium printToPDF", async () => {
    const page = await browser.newPage();
    try {
      const url = `http://127.0.0.1:${port}${E2E_ENTRY_PATH}`;
      await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });

      // Wait for the whitepaper-only entry to commit a layout pass.
      await page.waitForFunction(
        () =>
          (window as unknown as { __whitePaperE2EReady?: boolean })
            .__whitePaperE2EReady === true,
        { timeout: 30_000 },
      );
      await page.waitForSelector(".print-paper", { timeout: 30_000 });

      // Switch the page into print media so that the estimator runs
      // against the same layout the print pipeline will paginate.
      // Two production behaviours hinge on this:
      //
      //   1. `useExpandSectionsForPrint` in white-paper.tsx subscribes
      //      to `matchMedia('print')` and opens every
      //      `<details.wp-section>` on `change`. Without print
      //      emulation those sections stay collapsed and the
      //      estimator measures only the section titles.
      //   2. The `@media print` rules in `src/index.css` collapse
      //      backgrounds, neutralise gradients, and tighten page
      //      padding (`.print-paper` font-size: 11pt, line-height
      //      1.45, etc.). The print pipeline's actual line-by-line
      //      layout differs from the screen layout, and the
      //      estimator's job is to predict the PRINT page count so
      //      Safari / Firefox can inject the right number of
      //      "Page N of M" footers.
      //
      // Once print emulation is on, we still wait two animation
      // frames so React's `useExpandSectionsForPrint` effect has
      // observed the matchMedia change and the DOM has laid out the
      // now-visible section bodies before the estimator measures
      // them.
      await page.emulateMediaType("print");
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve()),
            ),
          ),
      );

      const estimated = await page.evaluate(() => {
        const fn = (
          window as unknown as { __estimateWhitePaperPageCount?: () => number }
        ).__estimateWhitePaperPageCount;
        if (typeof fn !== "function") {
          throw new Error(
            "window.__estimateWhitePaperPageCount missing — whitePaperE2E entry not loaded?",
          );
        }
        return fn();
      });

      expect(estimated).toBeGreaterThan(1);

      // Print to PDF using the @page rule from src/index.css. With
      // preferCSSPageSize: true, Chromium honours the stylesheet's
      // `size: letter` and `margin: 0.7in 0.6in 0.8in 0.6in`, so the
      // resulting page count IS the print pipeline's truth — what
      // Chrome's native @page counter(pages) would print.
      const pdfBytes = await page.pdf({
        preferCSSPageSize: true,
        printBackground: true,
      });
      const actual = await countPdfPages(pdfBytes);

      const delta = Math.abs(estimated - actual);
      // Surface the comparison in CI logs even when the assertion
      // passes — useful when the tolerance is approached after a
      // content change, before drift would actually fail the test.
      // eslint-disable-next-line no-console
      console.log(
        `[whitePaperPrint.e2e] estimated=${estimated} actual=${actual} delta=${delta} tolerance=±${PAGE_COUNT_TOLERANCE}`,
      );
      expect(
        delta,
        `estimateWhitePaperPageCount=${estimated} but printToPDF=${actual} ` +
          `(delta=${delta} pages, tolerance=±${PAGE_COUNT_TOLERANCE}). ` +
          "Tune estimateWhitePaperPageCount in src/components/whitePaperPrintEstimator.ts " +
          "or update the @page geometry in src/index.css until they agree.",
      ).toBeLessThanOrEqual(PAGE_COUNT_TOLERANCE);
    } finally {
      await page.close();
    }
  });
});
