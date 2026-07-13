import { NextResponse } from "next/server";
import { createDevOpsIssue } from "@/lib/byd-devops/issues";
import { formatFeedbackIssue, readFeedbackInput } from "@/modules/feedback/service";
import { toErrorResponse } from "@/shared/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    const input = readFeedbackInput(payload);
    const issue = await createDevOpsIssue(formatFeedbackIssue(input));

    return NextResponse.json({ data: { submitted: true, issue } }, { status: 201 });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
