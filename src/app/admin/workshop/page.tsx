import { AdminLoginClient } from "../AdminLoginClient";
import { isAdminPortalAuthenticated } from "../admin-auth";
import { AdminWorkshopClient } from "./AdminWorkshopClient";

export const dynamic = "force-dynamic";

export default async function AdminWorkshopPage() {
  if (!(await isAdminPortalAuthenticated())) {
    return <AdminLoginClient />;
  }

  return <AdminWorkshopClient />;
}
