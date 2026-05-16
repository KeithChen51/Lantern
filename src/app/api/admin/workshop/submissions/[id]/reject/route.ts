import { getCurrentWorkshopAdmin, jsonData, jsonError, workshopService } from "../../../../../_workshop";
import { requireString } from "@/shared/validation";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await getCurrentWorkshopAdmin();
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const comment = requireString(body.comment, "comment");
    return jsonData(await workshopService.rejectSubmission(id, admin, comment));
  } catch (error) {
    return jsonError(error);
  }
}
