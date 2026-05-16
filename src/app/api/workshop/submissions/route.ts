import { getCurrentWorkshopUser, jsonData, jsonError, readDraftInput, workshopService } from "../../_workshop";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentWorkshopUser();
    return jsonData(await workshopService.listPersonalSubmissions(user));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentWorkshopUser();
    const input = await readDraftInput(request, user);
    return jsonData(await workshopService.createDraft(input, user), 201);
  } catch (error) {
    return jsonError(error);
  }
}
