---
name: Recharts in print
description: Why print/PDF charts render blank and how to make them deterministic
---
Recharts series (Bar, Line, Area, Pie) animate from zero by default. When a print
view is rendered (browser Ctrl+P, or headless chromium --print-to-pdf), the snapshot
is often captured mid-animation, so bars/lines render at height 0 — they look empty
or "cut off".

**Rule:** every recharts series used in a print/PDF layout must set
`isAnimationActive={false}`.

**Why:** a real bug surfaced where one chart had the prop and rendered fine while a
sibling chart lacked it and printed blank — a race, intermittent across renders.

**How to apply:** when adding any chart to a print-only component, set
`isAnimationActive={false}` on the series. To reproduce/verify, render the public
share page to PDF with headless chromium and inspect the page images:
`chromium --headless --no-sandbox --no-pdf-header-footer --print-to-pdf=out.pdf <url>`
then `pdftoppm -png -r 90 out.pdf page`.
