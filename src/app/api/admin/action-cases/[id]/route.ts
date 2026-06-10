import { actionCaseService } from "@/modules/content";
import { requireAdminPortal, adminJsonError } from "../../../_admin";
import { AppError } from "@/shared/errors";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdminPortal();
    const { id } = await context.params;
    const actionCase = await actionCaseService.getAdminActionCase(id);
    if (!actionCase) throw new AppError("not_found", "Action case was not found.", 404);
    return Response.json({ data: actionCase });
  } catch (error) {
    return adminJsonError(error);
  }
}
