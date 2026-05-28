import { describe, expect, it } from "vitest";
import { lighthouseIcons } from "./lighthouse-icons";

describe("lighthouse icon registry", () => {
  it("exports local Solar icon data instead of remote icon names", () => {
    for (const icon of Object.values(lighthouseIcons)) {
      expect(typeof icon, "icons should render without string-name remote fetches").toBe("object");
      expect(icon.body).toContain("<");
    }
  });

  it("keeps the Solar 24px viewport so paths are not clipped", () => {
    for (const icon of Object.values(lighthouseIcons)) {
      expect(icon.width).toBe(24);
      expect(icon.height).toBe(24);
    }
  });
});
