import { describe, expect, it } from "vitest";
import {
  INTERFACE_DATA_ATTRIBUTE,
  INTERFACE_MODES,
  INTERFACE_STORAGE_KEY,
  isLighthouseInterface,
} from "./appearance-mode";

describe("appearance mode", () => {
  it("defines a separate interface mode contract", () => {
    expect(INTERFACE_DATA_ATTRIBUTE).toBe("data-lighthouse-interface");
    expect(INTERFACE_STORAGE_KEY).toBe("lighthouse-app-interface");
    expect(INTERFACE_MODES.map((mode) => mode.id)).toEqual(["modern", "classic"]);
  });

  it("validates interface ids", () => {
    expect(isLighthouseInterface("modern")).toBe(true);
    expect(isLighthouseInterface("classic")).toBe(true);
    expect(isLighthouseInterface("truth")).toBe(false);
    expect(isLighthouseInterface(null)).toBe(false);
  });
});
