import { getCurrentWorkshopUser, jsonData, jsonError, workshopService } from "../../../../_workshop";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentWorkshopUser();
    const { id } = await context.params;
    const submitted = await workshopService.submitForReview(id, user);
    return jsonData(await workshopService.runInitialReview(submitted.id));
  } catch (error) {
    return jsonError(error);
  }
}
