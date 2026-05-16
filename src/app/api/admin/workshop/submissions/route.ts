import { getCurrentWorkshopAdmin, jsonData, jsonError, workshopService } from "../../../_workshop";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await getCurrentWorkshopAdmin();
    return jsonData(await workshopService.listPendingAdminReviews(admin));
  } catch (error) {
    return jsonError(error);
  }
}
