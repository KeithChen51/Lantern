import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guard the production upgrade contract: this must remain an additive MySQL
// migration, preserving the employee relation and unowned historical rows.
describe("guest chat owner migration", () => {
  it("adds a nullable indexed guest owner without replacing employee ownership or legacy data", () => {
    const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
    const session = schema.match(/model ChatSession \{([\s\S]*?)\n\}/)?.[1];
    expect(session).toBeDefined();
    expect(session).toMatch(/userId\s+String\?\s+@map\("user_id"\)/);
    expect(session).toMatch(/guestId\s+String\?\s+@map\("guest_id"\) @db.VarChar\(191\)/);
    expect(session).toMatch(/User\?\s+@relation\("UserChatSessions", fields: \[userId\], references: \[id\], onDelete: SetNull\)/);
    expect(session).toContain("@@index([guestId, createdAt])");
    const migration = readFileSync(new URL("../../../prisma/migrations/20261019090000_add_guest_chat_owner/migration.sql", import.meta.url), "utf8");
    const statements = migration.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("--"));
    expect(statements).toEqual([
      "ALTER TABLE `chat_sessions` ADD COLUMN `guest_id` VARCHAR(191) NULL;",
      "CREATE INDEX `chat_sessions_guest_id_created_at_idx` ON `chat_sessions`(`guest_id`, `created_at`);",
    ]);
  });
});
