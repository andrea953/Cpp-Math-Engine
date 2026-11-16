import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ anchor: null as string | null }));
vi.mock("@/lib/client-session", () => ({
  useActiveAnchor: () => state.anchor,
  isEditorDirty: () => false,
  setActiveAnchor: vi.fn(),
  setEditorDirty: vi.fn(),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/scenarios", vi.fn()] }));

import { ClientIndexGate } from "@/components/client-guard";

afterEach(() => {
  state.anchor = null;
  vi.unstubAllGlobals();
});

describe("client list privacy gate", () => {
  it("does not mount the full client index while a client is active", () => {
    vi.stubGlobal("React", React);
    state.anchor = "active-scenario-id";
    const index = vi.fn(() => <div>Other client's confidential name</div>);
    const html = renderToStaticMarkup(
      <ClientIndexGate>{React.createElement(index)}</ClientIndexGate>,
    );
    expect(index).not.toHaveBeenCalled();
    expect(html).not.toContain("Other client's confidential name");
    expect(html).toContain("Client workspace is still open");
    expect(html).toContain("button-gate-return");
  });

  it("allows the client index when there is no active client", () => {
    vi.stubGlobal("React", React);
    const html = renderToStaticMarkup(
      <ClientIndexGate><div>Client index allowed</div></ClientIndexGate>,
    );
    expect(html).toContain("Client index allowed");
    expect(html).not.toContain("panel-client-index-gate");
  });
});
