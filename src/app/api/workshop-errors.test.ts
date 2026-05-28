import { describe, expect, it } from "vitest";
import { getWorkshopUnavailableMessage } from "./workshop-errors";

describe("workshop api user-facing errors", () => {
  it("uses product copy instead of leaking infrastructure details", () => {
    const message = getWorkshopUnavailableMessage();

    expect(message).toContain("行动指南");
    expect(message).not.toMatch(/DATABASE_URL|MySQL|Prisma/i);
  });
});
