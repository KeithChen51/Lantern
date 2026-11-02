import { describe, expect, it } from "vitest";
import { createLoginArrival, LOGIN_ARRIVAL_MAX_AGE, validLoginArrival } from "./login-arrival";

const config = { origin: "https://app.invalid", encryptionKey: Buffer.alloc(32, 7).toString("base64") };
const now = 1793600000000;

describe("login arrival is a short-lived visual signal bound to the authenticated destination", () => {
  it("validates only the matching session, origin and full target", () => {
    const marker = createLoginArrival(config, "session-one", "/heart?view=values", now);
    expect(validLoginArrival(config, marker, "session-one", "/heart?view=values", now + 1)).toBe(true);
    expect(validLoginArrival(config, marker, "session-two", "/heart?view=values", now + 1)).toBe(false);
    expect(validLoginArrival(config, marker, undefined, "/heart?view=values", now + 1)).toBe(false);
    expect(validLoginArrival(config, marker, "session-one", "/heart", now + 1)).toBe(false);
    expect(validLoginArrival({ ...config, origin: "https://another.invalid" }, marker, "session-one", "/heart?view=values", now + 1)).toBe(false);
    expect(marker).not.toContain("session-one");
  });
  it("rejects tampering, future and expired markers", () => {
    const marker = createLoginArrival(config, "session-one", "/", now);
    expect(validLoginArrival(config, marker.replace(/^1/, "2"), "session-one", "/", now)).toBe(false);
    expect(validLoginArrival(config, `${marker}x`, "session-one", "/", now)).toBe(false);
    expect(validLoginArrival(config, marker, "session-one", "/", now - 1)).toBe(false);
    expect(validLoginArrival(config, marker, "session-one", "/", now + LOGIN_ARRIVAL_MAX_AGE * 1000 + 1)).toBe(false);
  });
});
