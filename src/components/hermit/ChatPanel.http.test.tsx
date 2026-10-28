import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatPanel } from "./ChatPanel";
import { createConversationId } from "./conversation-id";

afterEach(() => vi.unstubAllGlobals());

describe("Hermit HTTP browser compatibility", () => {
  it("renders the workspace when crypto.randomUUID is unavailable on an HTTP origin", () => {
    vi.stubGlobal("crypto", { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const html = renderToStaticMarkup(<ChatPanel />);
    expect(html).toContain("让灯塔知识，帮你找到下一步。");
    expect(html).toContain("新对话");
    expect(html).toContain("textarea");
  });

  it("generates distinct UUID v4 conversation IDs without randomUUID", () => {
    vi.stubGlobal("crypto", { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const ids = Array.from({ length: 100 }, () => createConversationId());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("keeps the native UUID generator when available", () => {
    const randomUUID = vi.fn(() => "12345678-1234-4123-8123-123456789abc");
    const getRandomValues = vi.fn();
    vi.stubGlobal("crypto", { randomUUID, getRandomValues });
    expect(createConversationId()).toBe("12345678-1234-4123-8123-123456789abc");
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });
});
