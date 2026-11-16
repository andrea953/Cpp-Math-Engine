---
name: Client meeting navigation
description: Why browser-history protection needs an accepted router snapshot rather than per-editor event interception.
---

Keep the router on an accepted location snapshot until a dirty-editor navigation is confirmed, including native browser Back/Forward. Button-level confirmations and a capture listener alongside live-location routing are insufficient.

**Why:** In a real browser check, the live-location subscription allowed the editor to unmount and clear its dirty flag before a separate history guard could ask for confirmation. Cancelling Back then could not preserve unsaved inputs. A shared accepted snapshot was verified to keep the editor mounted and preserve its unsaved value.

**How to apply:** Preserve this invariant when modifying routing or navigation safeguards. Regression checks should include native browser Back with an unsaved title, cancellation preserving the URL and input, and accepted navigation loading the destination's own inputs. Keep screen-sharing protection distinct from server authorization.
