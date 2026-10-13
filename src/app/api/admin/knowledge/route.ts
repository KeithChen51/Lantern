import { hubJson, boundedKnowledgeJson } from "@/modules/knowledge-hub/http";
import { requireKnowledgeAdmin, assertWebMutation } from "@/modules/auth/access";
import { assertKnowledgeManagerStorage } from "@/modules/knowledge-hub/manager-storage";
import { assertDatabaseConfigured, adminJsonError } from "../../_admin";
import { createKnowledgeManager, knowledgeManagerErrorResponse } from "@/modules/knowledge-hub/manager";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return knowledgeManagerErrorResponse(error) ?? adminJsonError(error);
}

export async function GET(request: Request) {
  try {
    try { await requireKnowledgeAdmin(request); } catch (error) { return adminJsonError(error); }
    assertKnowledgeManagerStorage();
    assertDatabaseConfigured();
    return hubJson(await createKnowledgeManager().list(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireKnowledgeAdmin(request, { write: true });
    assertWebMutation(request, principal);
    assertKnowledgeManagerStorage();
    assertDatabaseConfigured();

    const body = await boundedKnowledgeJson(request);
    return hubJson(await createKnowledgeManager(undefined, { userId: principal.userId, account: principal.account, requestId: crypto.randomUUID() }).apply(body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
