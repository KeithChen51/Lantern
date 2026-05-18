import { describe, expect, it } from "vitest";
import { getVisibleWorkshopSections } from "./workshop-sections";

describe("workshop sections", () => {
  it("keeps frontline Workshop to the public, submission, and personal areas", () => {
    expect(getVisibleWorkshopSections("normal_user").map((section) => section.id)).toEqual([
      "public",
      "submit",
      "personal",
    ]);
  });

  it("places administrator review inside Workshop instead of the primary navigation", () => {
    expect(getVisibleWorkshopSections("highest_admin").map((section) => section.id)).toEqual([
      "public",
      "submit",
      "personal",
      "review",
    ]);
  });
});
