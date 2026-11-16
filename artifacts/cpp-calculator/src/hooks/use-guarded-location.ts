import { useCallback, useSyncExternalStore } from "react";
import { navigate, type BrowserLocationHook } from "wouter/use-browser-location";
import { isEditorDirty, setEditorDirty } from "@/lib/client-session";
import { acceptedPathname, currentUrl, DISCARD_MESSAGE, subscribeGuardedLocation } from "@/lib/guarded-location";

/**
 * Covers header links as well as editor controls. All router consumers read an
 * accepted snapshot rather than the browser's already-changed history location.
 * Full-document navigation continues to use the editor's beforeunload warning.
 */
export const useGuardedLocation: BrowserLocationHook = (options) => {
  const location = useSyncExternalStore(
    subscribeGuardedLocation,
    acceptedPathname,
    () => options?.ssrPath ?? "/",
  );
  const guardedNavigate: typeof navigate = useCallback((to, navigationOptions) => {
    const target = new URL(to, window.location.href);
    const changed = target.pathname + target.search + target.hash !== currentUrl();
    if (changed && isEditorDirty()) {
      if (!window.confirm(DISCARD_MESSAGE)) return;
      setEditorDirty(false);
    }
    navigate(to, navigationOptions);
  }, [navigate]);

  return [location, guardedNavigate];
};
