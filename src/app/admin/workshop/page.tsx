import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authRepository, canAccessAdminWorkshop, createAuthService } from "@/modules/auth";
import { AdminWorkshopClient } from "./AdminWorkshopClient";

export const dynamic = "force-dynamic";

const authService = createAuthService(authRepository);

export default async function AdminWorkshopPage() {
  let user: Awaited<ReturnType<typeof authService.getCurrentUser>>;
  try {
    const requestHeaders = await headers();
    user = await authService.getCurrentUser({ headers: requestHeaders });
  } catch {
    if (process.env.NODE_ENV === "production") {
      redirect("/workshop");
    }
    return <AdminWorkshopClient />;
  }

  if (!canAccessAdminWorkshop(user)) {
    redirect("/workshop");
  }

  return <AdminWorkshopClient />;
}
