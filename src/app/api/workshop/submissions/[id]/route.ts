import { getCurrentWorkshopUser, jsonData, jsonError, readEditableContent, workshopService } from "../../../_workshop";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentWorkshopUser();
    const { id } = await context.params;
    const content = await readEditableContent(request);
    return jsonData(await workshopService.reviseSubmission(id, user, content));
  } catch (error) {
    return jsonError(error);
  }
}
