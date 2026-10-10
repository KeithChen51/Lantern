import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "./route";

const requestWith = (url: string, headers: Record<string, string>) => new Request(url, { method: "POST", headers });

describe("knowledge manager same-origin guard", () => {
  it("accepts the browser origin when the public Host differs from the internal URL", () => {
    expect(() => assertSameOrigin(requestWith("http://0.0.0.0:3000/api/admin/knowledge", {
      origin: "http://127.0.0.1:3301",
      host: "127.0.0.1:3301",
      "x-forwarded-host": "evil.example",
    }))).not.toThrow();
  });

  it("rejects an origin whose host differs from Host", () => {
    expect(() => assertSameOrigin(requestWith("http://0.0.0.0:3000/api/admin/knowledge", {
      origin: "http://evil.example:3301",
      host: "127.0.0.1:3301",
    }))).toThrow(expect.objectContaining({ code: "forbidden", status: 403 }));
  });

  it("only accepts HTTP and HTTPS origins", () => {
    expect(() => assertSameOrigin(requestWith("http://127.0.0.1:3301/api/admin/knowledge", {
      origin: "ftp://127.0.0.1:3301",
      host: "127.0.0.1:3301",
    }))).toThrow(expect.objectContaining({ code: "forbidden", status: 403 }));
  });

  it("falls back to the request URL host when Host is absent", () => {
    expect(() => assertSameOrigin(requestWith("http://127.0.0.1:3301/api/admin/knowledge", {
      origin: "http://127.0.0.1:3301",
    }))).not.toThrow();
  });
});
