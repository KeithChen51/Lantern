import { AdminLoginClient } from "../AdminLoginClient";
import { isAdminPortalAuthenticated } from "../admin-auth";
import { AdminKnowledgeManager } from "./AdminKnowledgeManager";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgePage() {
  if (!(await isAdminPortalAuthenticated())) {
    return <AdminLoginClient />;
  }

  return <AdminKnowledgeManager />;
}
