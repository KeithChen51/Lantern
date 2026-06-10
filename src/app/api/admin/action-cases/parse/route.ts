import { requireAdminPortal, adminJsonError } from "../../../_admin";
import { parseMarkdown, readMarkdownFromFormData } from "../action-case-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireAdminPortal();
    const formData = await request.formData();
    const { markdown, fileName } = await readMarkdownFromFormData(formData);
    return Response.json({ data: parseMarkdown(markdown, fileName) });
  } catch (error) {
    return adminJsonError(error);
  }
}
