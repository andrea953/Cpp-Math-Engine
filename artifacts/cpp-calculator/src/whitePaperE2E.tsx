/**
 * Standalone Vite entry used only by `whitePaperPrint.e2e.test.ts`.
 *
 * The real app entry (`main.tsx`) wraps everything in `<ClerkProvider>`
 * and `<WouterRouter>`, both of which require runtime configuration
 * (publishable keys, route base) that would distract a print-pagination
 * test. This entry renders just the white paper, on its own, against a
 * white background, and exposes the same `estimateWhitePaperPageCount`
 * function that `useCrossBrowserPrintMargins` calls at print time on
 * `window.__estimateWhitePaperPageCount` so the e2e test can read the
 * estimator's value without driving the matchMedia('print') side
 * effects (which would themselves inject DOM and skew the comparison).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WhitePaper } from "@/components/white-paper";
import { estimateWhitePaperPageCount } from "@/components/whitePaperPrintEstimator";
import "./index.css";

// These constants must stay in lockstep with the ones declared inside
// `useCrossBrowserPrintMargins` in `src/components/white-paper.tsx`.
// The snapshot test in `whitePaperPrintEstimator.test.ts` guards the
// production copy; this duplicate is intentional so the e2e test exercises
// exactly the same formula without exporting internal hook scope.
const PAGE_CONTENT_PX = 9.5 * 96;
const PRINT_WIDTH_PX = 7.3 * 96;

declare global {
  interface Window {
    __estimateWhitePaperPageCount?: () => number;
    __whitePaperE2EReady?: boolean;
  }
}

window.__estimateWhitePaperPageCount = (): number => {
  const root = document.querySelector<HTMLElement>(".print-paper");
  if (!root) return 0;
  return estimateWhitePaperPageCount(root, {
    pageContentPx: PAGE_CONTENT_PX,
    printWidthPx: PRINT_WIDTH_PX,
  });
};

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");

createRoot(el).render(
  <StrictMode>
    <WhitePaper />
  </StrictMode>,
);

// Set after the next animation frame so the test can wait on a stable
// signal (the React tree has been committed and laid out at least once).
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__whitePaperE2EReady = true;
  });
});
