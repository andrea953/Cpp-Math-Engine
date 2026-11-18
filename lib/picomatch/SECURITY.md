# Local picomatch security fork

This directory was extracted from the published `picomatch@4.0.7` package
using `pnpm patch`. The upstream MIT license and attribution are retained.
`@workspace/picomatch@4.0.8-local.0` identifies this local fork, **not** an
upstream release. Its distinct package name also prevents dependency scanners
from confusing a local file reference with an unknown upstream version.

## Why it is vendored

GHSA-fc5q-39xc-vjpf (CVE-2026-112366) affects all published versions through
4.0.7. At remediation time the advisory listed no patched version, and 4.0.7
was the latest registry release. Upgrading parent dependencies cannot fix it.

The application's server proxy has no user-controlled glob filter, but
transitive build, test, file-discovery, and proxy dependencies still install
the affected matcher. A workspace-wide alias override replaces every copy.

## Targeted safeguard

The existing repeated-extglob analyzer only catches some multi-branch or
nested cases. This fork permits repeated groups only for literal, prefix-free
alternatives or the existing safe character-class reduction. Every other
repeated group uses the parser's existing literalization path, independently
of the optional recursion limit.

This covers single-branch wildcards (`+(*)`, `+(*a)`), multi-character
literal-prefix overlap (`+(ab|abab)`), overlap introduced by wildcards or
character classes (`+(a|?a)`, `+(a|[a]a)`), quoted alternatives, nested
repeated groups, and their `*(...)` equivalents. Escaped literal characters
remain supported.

Ordinary globs and literal-only extglobs remain supported. Some advanced
wildcard-bearing repeated extglobs intentionally match literally instead;
this is a conservative compatibility restriction, not a general guarantee
against every possible regex denial of service.

Run `pnpm --dir lib/picomatch test` for bounded child-process regression tests.
Once upstream publishes a verified fix, remove the file override and this
directory, regenerate the lockfile, and rerun these cases before adopting it.

Advisory: https://github.com/advisories/GHSA-fc5q-39xc-vjpf
