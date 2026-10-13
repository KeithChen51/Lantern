import { readActionCaseCoverImage } from "@/infrastructure/storage";
import { toErrorResponse } from "@/shared/errors";
import { requireEmployee } from "@/modules/auth/access";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ filename: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireEmployee(request);
    const { filename } = await context.params;
    const image = await readActionCaseCoverImage(filename);
    return new Response(image.buffer, {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const response = toErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
