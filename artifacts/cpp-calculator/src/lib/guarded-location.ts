import { isEditorDirty, setEditorDirty } from "./client-session";

export const DISCARD_MESSAGE = "Discard unsaved changes to this scenario?";
const events = ["popstate", "pushState", "replaceState", "hashchange"] as const;
const listeners = new Set<() => void>();
let accepted: { path: string; url: string } | null = null;

export function currentUrl() {
  return window.location.pathname + window.location.search + window.location.hash;
}

export function acceptedPathname() {
  if (!accepted) accepted = { path: window.location.pathname, url: currentUrl() };
  return accepted.path;
}

function syncNavigation() {
  const next = { path: window.location.pathname, url: currentUrl() };
  if (accepted?.url === next.url) return;
  if (accepted && isEditorDirty()) {
    if (!window.confirm(DISCARD_MESSAGE)) {
      // Keep the router's accepted snapshot unchanged, so the editor cannot
      // unmount while browser history is restored after a cancelled Back.
      window.history.pushState(null, "", accepted.url);
      return;
    }
    setEditorDirty(false);
  }
  accepted = next;
  listeners.forEach((notify) => notify());
}

export function subscribeGuardedLocation(notify: () => void) {
  if (listeners.size === 0) {
    acceptedPathname();
    events.forEach((event) => window.addEventListener(event, syncNavigation, true));
  }
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) {
      events.forEach((event) => window.removeEventListener(event, syncNavigation, true));
      accepted = null;
    }
  };
}
