---
name: white-paper print estimator snapshot
description: Editing white-paper.tsx content drifts a print-estimator inline snapshot that must be updated.
---

# White-paper print estimator snapshot

Editing the content of `artifacts/cpp-calculator/src/components/white-paper.tsx`
(adding/removing paragraphs, list items, examples, inline math, headings, or
visible text) drifts the inline snapshot in
`src/cpp/__tests__/whitePaperPrintEstimator.test.ts`. It fingerprints counts
like `listItems`, `paragraphs`, `visibleTextLengthBucket`, etc.

**Why:** the cross-browser print hook (`useCrossBrowserPrintMargins` in
white-paper.tsx) estimates the printed page count from these DOM counts to
position per-page running headers/footers for Safari/Firefox (which ignore
`@page` margin boxes). The snapshot is a guard so content growth is reviewed
against the estimator geometry.

**How to apply:** after intentional white-paper content edits, do NOT just run
`-u`. The drift can be a real regression. Order:
1. Run the real-browser truth check first:
   `pnpm --filter @workspace/cpp-calculator test:e2e` (boots Chromium, compares
   `estimateWhitePaperPageCount` against an actual printed PDF; needs system
   `chromium`). This e2e test lives at
   `src/components/__tests__/whitePaperPrint.e2e.test.ts` and is EXCLUDED from the
   default `pnpm test` / `vitest run` (separate `vitest.e2e.config.ts`).
2. If e2e passes, refresh the snapshot:
   `pnpm --filter @workspace/cpp-calculator exec vitest run -u src/cpp/__tests__/whitePaperPrintEstimator.test.ts`.
3. If e2e fails (page-count delta ≥ 2), tune `estimateWhitePaperPageCount` in
   `src/components/whitePaperPrintEstimator.ts` (or `@page` geometry in
   `src/index.css`) until e2e passes, THEN update the snapshot.

See `artifacts/cpp-calculator/RUNBOOK.md` (annual Jan update) and `TESTING.md`.
