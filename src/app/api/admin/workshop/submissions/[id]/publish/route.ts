import {
  getCurrentWorkshopAdmin,
  jsonData,
  jsonError,
  readEditableContent,
  workshopService,
} from "../../../../../_workshop";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await getCurrentWorkshopAdmin();
    const { id } = await context.params;
    const editedContent = await readEditableContent(request);
    return jsonData(await workshopService.publishSubmission(id, admin, editedContent));
  } catch (error) {
    return jsonError(error);
  }
}
