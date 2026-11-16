import { useSyncExternalStore } from "react";
import type { Scenario } from "@workspace/api-client-react";

/**
 * Screen-sharing safeguard (NOT authorization). While a client workspace is
 * active we remember ONLY the anchor scenario id for this browser tab, so a
 * reload or browser Back cannot silently reveal the all-clients index.
 * No names or financial inputs are ever stored.
 */
const KEY = "cpp:active-client-anchor";
const EVENT = "cpp:active-client-change";
let memoryAnchor: string | null = null;

export function getActiveAnchor(): string | null {
  if (typeof window === "undefined") return null;
  try {
    memoryAnchor = window.sessionStorage.getItem(KEY);
    return memoryAnchor;
  } catch {
    return memoryAnchor;
  }
}

export function setActiveAnchor(id: string | null) {
  if (typeof window === "undefined") return;
  memoryAnchor = id;
  try {
    if (id) window.sessionStorage.setItem(KEY, id);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // The in-memory copy still protects navigation in this page session.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useActiveAnchor(): string | null {
  return useSyncExternalStore(subscribe, getActiveAnchor, () => null);
}

/** In-memory flag so global exits can warn about unsaved editor changes. */
let editorDirty = false;
export function setEditorDirty(v: boolean) {
  editorDirty = v;
}
export function isEditorDirty() {
  return editorDirty;
}

/** Ephemeral query-cache key; client names never go into browser storage. */
export const emptyClientWorkspaceKey = (anchorId: string) =>
  ["empty-client-workspace", anchorId] as const;

export function clientKey(name: string | undefined | null): string {
  return (name ?? "").trim().toLocaleLowerCase();
}

/**
 * Scenarios that belong to the anchor's client. Grouping matches the index
 * (trimmed, case-insensitive clientName). A nameless anchor is isolated to
 * itself so unrelated unassigned records are never shown together.
 */
export function scenariosForClient(anchor: Scenario, all: Scenario[]): Scenario[] {
  const key = clientKey(anchor.clientName);
  const list = key ? all.filter((s) => clientKey(s.clientName) === key) : all.filter((s) => s.id === anchor.id);
  if (!list.some((s) => s.id === anchor.id)) list.push(anchor);
  return [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}
