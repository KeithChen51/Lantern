import type { AuthUserRecord } from "./types";

export function canAccessAdminWorkshop(user: Pick<AuthUserRecord, "roles">) {
  return user.roles.includes("highest_admin");
}
