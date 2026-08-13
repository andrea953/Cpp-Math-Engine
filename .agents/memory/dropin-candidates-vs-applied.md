---
name: Drop-in candidates vs applied credits
description: dropInAmountsByYear lists candidate imputed amounts, not applied credits — never surface it to clients directly.
---

`EnhancementCalcDiagnostics.dropInAmountsByYear` records a positive imputed amount for every protected year with eligible prior earnings, even when real earnings already exceed it or the year is at/after the selected start year (so it never feeds that result).

**Why:** A client-facing "your caregiving years were credited" note built from candidates was rejected in review as materially misleading financial guidance.

**How to apply:** Any client-facing claim about caregiving/disability credits must come from `appliedCaregivingDropIns` (or an equivalent applied-credit diagnostic: year < start year AND imputed > real). When results span multiple start ages, only claim credits present in every displayed option.
