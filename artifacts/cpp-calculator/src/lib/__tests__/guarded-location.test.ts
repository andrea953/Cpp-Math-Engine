import { afterEach, describe, expect, it, vi } from "vitest";
import { setEditorDirty } from "../client-session";
import { acceptedPathname, subscribeGuardedLocation } from "../guarded-location";

let unsubscribe: (() => void) | undefined;
afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  setEditorDirty(false);
  vi.unstubAllGlobals();
});

function setup() {
  const eventTarget = new EventTarget();
  const location = { pathname: "/scenarios/first", search: "", hash: "" };
  const confirm = vi.fn(() => false);
  const browser = {
    location,
    confirm,
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    history: {
      pushState: vi.fn((_state: unknown, _title: string, url: string) => {
        location.pathname = url;
        eventTarget.dispatchEvent(new Event("pushState"));
      }),
    },
  };
  vi.stubGlobal("window", browser);
  const notify = vi.fn();
  unsubscribe = subscribeGuardedLocation(notify);
  return { ...browser, eventTarget, notify };
}

describe("guarded router snapshot", () => {
  it("never publishes a cancelled browser Back, preserving the mounted editor", () => {
    const browser = setup();
    setEditorDirty(true);
    browser.location.pathname = "/clients/first";
    browser.eventTarget.dispatchEvent(new Event("popstate"));
    expect(browser.confirm).toHaveBeenCalledOnce();
    expect(browser.location.pathname).toBe("/scenarios/first");
    expect(acceptedPathname()).toBe("/scenarios/first");
    expect(browser.notify).not.toHaveBeenCalled();
  });

  it("publishes a browser history change only after discarding is accepted", () => {
    const browser = setup();
    browser.confirm.mockReturnValue(true);
    setEditorDirty(true);
    browser.location.pathname = "/clients/first";
    browser.eventTarget.dispatchEvent(new Event("popstate"));
    expect(acceptedPathname()).toBe("/clients/first");
    expect(browser.notify).toHaveBeenCalledOnce();
    expect(browser.history.pushState).not.toHaveBeenCalled();
  });

  it("does not prompt when there are no unsaved changes", () => {
    const browser = setup();
    browser.location.pathname = "/clients/first";
    browser.eventTarget.dispatchEvent(new Event("popstate"));
    expect(browser.confirm).not.toHaveBeenCalled();
    expect(acceptedPathname()).toBe("/clients/first");
    expect(browser.notify).toHaveBeenCalledOnce();
  });
});
