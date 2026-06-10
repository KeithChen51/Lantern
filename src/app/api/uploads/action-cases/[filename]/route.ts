import { readActionCaseCoverImage } from "@/infrastructure/storage";
import { toErrorResponse } from "@/shared/errors";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ filename: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { filename } = await context.params;
    const image = await readActionCaseCoverImage(filename);
    return new Response(image.buffer, {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const response = toErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
