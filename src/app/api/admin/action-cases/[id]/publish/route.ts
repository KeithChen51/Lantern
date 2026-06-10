import { actionCaseService } from "@/modules/content";
import { requireAdminPortal, adminJsonError } from "../../../../_admin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireAdminPortal();
    const { id } = await context.params;
    return Response.json({ data: await actionCaseService.publish(id) });
  } catch (error) {
    return adminJsonError(error);
  }
}
