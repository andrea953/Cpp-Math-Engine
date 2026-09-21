---
name: pnpm workspace audit fixes
description: How dependency audit remediation behaves in this shared-lockfile pnpm workspace.
---

Run the requested audit command from each manifest directory, but expect pnpm to write remediation overrides into the shared workspace configuration rather than each package manifest.

**Why:** Every package belongs to one pnpm workspace with a single root lockfile, so nested audit commands resolve upward and report the same workspace-wide changes. Repeating them does not create separate lockfiles or independently apply the fixes.

**How to apply:** After all per-manifest audit commands, reconcile conflicting existing overrides, run one root install to regenerate the shared lockfile, then scan the whole pruned tree for every reported package-version pair and run a final workspace audit.