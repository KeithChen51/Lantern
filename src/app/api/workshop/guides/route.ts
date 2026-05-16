import { getCurrentWorkshopUser, jsonData, jsonError, workshopService } from "../../_workshop";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentWorkshopUser();
    const url = new URL(request.url);
    return jsonData(
      await workshopService.listPublishedGuides(user.scope, {
        roleName: url.searchParams.get("roleName"),
        query: url.searchParams.get("query"),
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
