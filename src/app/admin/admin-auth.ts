import { headers } from "next/headers";
import { requireKnowledgeAdmin } from "@/modules/auth/access";

export async function isAdminPortalAuthenticated() {
  try { await requireKnowledgeAdmin(await headers()); return true; } catch { return false; }
}
