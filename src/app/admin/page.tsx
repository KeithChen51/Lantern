import { AdminHome } from "./AdminHome";
import { AdminLoginClient } from "./AdminLoginClient";
import { isAdminPortalAuthenticated } from "./admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdminPortalAuthenticated())) {
    return <AdminLoginClient />;
  }

  return <AdminHome />;
}
