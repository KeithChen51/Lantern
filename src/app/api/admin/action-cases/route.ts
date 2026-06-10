import { actionCaseService } from "@/modules/content";
import { requireAdminPortal, adminJsonError } from "../../_admin";
import { readDraftInputFromFormData } from "./action-case-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminPortal();
    return Response.json({ data: await actionCaseService.listAdminActionCases() });
  } catch (error) {
    return adminJsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPortal();
    const formData = await request.formData();
    return Response.json({ data: await actionCaseService.saveDraft(await readDraftInputFromFormData(formData)) }, { status: 201 });
  } catch (error) {
    return adminJsonError(error);
  }
}
