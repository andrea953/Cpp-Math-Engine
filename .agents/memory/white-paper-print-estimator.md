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

**How to apply:** after intentional white-paper content edits, update with
`pnpm --filter @workspace/cpp-calculator exec vitest run -u src/cpp/__tests__/whitePaperPrintEstimator.test.ts`.
The drift should match exactly the elements you added/removed; if it doesn't,
the estimator or geometry is off, not just the snapshot.
