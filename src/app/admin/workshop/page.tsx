import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authRepository, canAccessAdminWorkshop, createAuthService } from "@/modules/auth";

export const dynamic = "force-dynamic";

const authService = createAuthService(authRepository);

export default async function AdminWorkshopPage() {
  const requestHeaders = await headers();
  const user = await authService.getCurrentUser({ headers: requestHeaders });

  if (!canAccessAdminWorkshop(user)) {
    redirect("/workshop");
  }

  redirect("/workshop?section=review");
}
