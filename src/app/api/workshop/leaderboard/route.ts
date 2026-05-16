import { getCurrentWorkshopUser, jsonData, jsonError, workshopService } from "../../_workshop";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentWorkshopUser();
    return jsonData(await workshopService.getContributionLeaderboard(user.scope));
  } catch (error) {
    return jsonError(error);
  }
}
