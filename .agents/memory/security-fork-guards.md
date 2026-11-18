---
name: Security fork safeguards
description: Choosing a fail-closed grammar restriction when upstream has no published ReDoS fix.
---

For a temporary security fork of a pattern compiler, allow only a clearly safe subset inside repeated groups rather than enumerating known attack strings.

**Why:** Narrow checks for stars or repeated single-character alternatives missed ambiguity introduced by multi-character prefixes, question marks, character classes, and quoting. A clean dependency audit cannot prove a local fork is safe.

**How to apply:** Document deliberate compatibility restrictions and upstream provenance, preserve licensing, and test failing inputs against wildcard, alternative, quoting, and nesting cases inside a child process with a hard timeout.
