import { afterEach, describe, expect, it, vi } from "vitest";
import type { Scenario } from "@workspace/api-client-react";
import { getActiveAnchor, isEditorDirty, scenariosForClient, setActiveAnchor, setEditorDirty } from "../client-session";

afterEach(() => {
  setActiveAnchor(null);
  setEditorDirty(false);
  vi.unstubAllGlobals();
});

const s = (id: string, clientName?: string, title = id): Scenario =>
  ({ id, title, clientName, inputs: {} as Scenario["inputs"], createdAt: "", updatedAt: "" });

describe("scenariosForClient", () => {
  const all = [s("a", "Lindsay B"), s("b", " lindsay b "), s("c", "Other"), s("d"), s("e", "  ")];

  it("groups by trimmed, case-insensitive client name", () => {
    expect(scenariosForClient(all[0], all).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("isolates a nameless anchor from other unassigned scenarios", () => {
    expect(scenariosForClient(all[3], all).map((x) => x.id)).toEqual(["d"]);
    expect(scenariosForClient(all[4], all).map((x) => x.id)).toEqual(["e"]);
  });

  it("includes the anchor even if the list is stale", () => {
    expect(scenariosForClient(s("z", "New"), all).map((x) => x.id)).toEqual(["z"]);
  });

  it("does not include a similarly named but different client", () => {
    const anchor = s("a", "Example");
    expect(scenariosForClient(anchor, [anchor, s("b", "Example Family")]).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("tab privacy state", () => {
  it("stores only the anchor id and can clear it deliberately", () => {
    const values = new Map<string, string>();
    const events = new EventTarget();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: (key: string) => values.delete(key),
    };
    vi.stubGlobal("window", {
      sessionStorage: storage,
      dispatchEvent: events.dispatchEvent.bind(events),
    });
    setActiveAnchor("scenario-id");
    expect(getActiveAnchor()).toBe("scenario-id");
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith("cpp:active-client-anchor", "scenario-id");
    setActiveAnchor(null);
    expect(getActiveAnchor()).toBeNull();
  });

  it("keeps in-page protection when browser storage is blocked", () => {
    const events = new EventTarget();
    vi.stubGlobal("window", {
      get sessionStorage() { throw new Error("Storage blocked"); },
      dispatchEvent: events.dispatchEvent.bind(events),
    });
    setActiveAnchor("protected-anchor");
    expect(getActiveAnchor()).toBe("protected-anchor");
    setActiveAnchor(null);
    expect(getActiveAnchor()).toBeNull();
  });

  it("tracks unsaved edits without persisting the draft", () => {
    setEditorDirty(true);
    expect(isEditorDirty()).toBe(true);
    setEditorDirty(false);
    expect(isEditorDirty()).toBe(false);
  });
});
