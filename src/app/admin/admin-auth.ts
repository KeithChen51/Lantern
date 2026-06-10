import { cookies } from "next/headers";
import { ADMIN_PORTAL_COOKIE } from "@/modules/admin";
import { verifyAdminPortalSessionCookieValue } from "@/modules/admin/portal";

export async function isAdminPortalAuthenticated() {
  const cookieStore = await cookies();
  return verifyAdminPortalSessionCookieValue(cookieStore.get(ADMIN_PORTAL_COOKIE)?.value);
}
