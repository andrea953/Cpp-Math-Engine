---
name: pnpm workspace audit fixes
description: How dependency audit remediation behaves in this shared-lockfile pnpm workspace.
---

Run the requested audit command from each manifest directory, but expect pnpm to write remediation overrides into the shared workspace configuration rather than each package manifest.

**Why:** Every package belongs to one pnpm workspace with a single root lockfile, so nested audit commands resolve upward and report the same workspace-wide changes. Repeating them does not create separate lockfiles or independently apply the fixes.

**How to apply:** After all per-manifest audit commands, reconcile conflicting existing overrides, run one root install to regenerate the shared lockfile, then scan the whole pruned tree for every reported package-version pair and run a final workspace audit.

For an explicitly maintained local security fork, give it a distinct workspace-scoped name and use a `workspace:` alias override instead of an upstream-named `file:` override.

**Why:** The dependency scanner interprets upstream-named `file:` lockfile entries as unknown upstream versions and can report even already-fixed historical advisories. A scoped workspace alias accurately distinguishes the fork; it is not a substitute for patching and testing the vulnerable behavior.

**How to apply:** Document upstream provenance, compatibility restrictions, and removal criteria with the fork, retain the license, and test the actual attack patterns with a process timeout.