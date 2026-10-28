import { requireSiteVisitor, authErrorResponse } from "@/modules/auth/access";
import { resolveHermitAttachments } from "@/lib/hermit/attachments";
import { getSiteKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { AppError } from "@/shared/errors";
import { hermitChatRepository } from "./repository";
import { assertHermitHistoryPrincipal, readHistoryPage, restoreHistoryMessages } from "./history";
import type { HermitConversationDetail } from "@/lib/hermit/conversation-contract";
import { resolveHermitSkillContext } from "./skill-context";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function listHermitConversations(request: Request) {
  try {
    const principal = await requireSiteVisitor(request);
    assertHermitHistoryPrincipal(principal);
    const page = readHistoryPage(new URL(request.url).searchParams);
    return Response.json(await hermitChatRepository.listConversations(principal.userId, page), { headers });
  } catch (error) { return authErrorResponse(error); }
}

export async function getHermitConversation(request: Request, id: string) {
  try {
    const principal = await requireSiteVisitor(request);
    assertHermitHistoryPrincipal(principal);
    if (!id.trim() || id.length > 160) throw new AppError("bad_request", "对话标识无效。", 400);
    const session = await hermitChatRepository.getConversation(principal.userId, id);
    const restored = restoreHistoryMessages(session.messages);
    const detail: HermitConversationDetail = { id: session.id, title: session.title || "新的对话", messages: restored.messages,
      attachments: [], unavailableAttachments: [], documentContext: null, skillContext: null, unavailableSkillContext: null };
    for (const file of restored.context.attachments) {
      try {
        const [resolved] = await resolveHermitAttachments(principal, [file.id]);
        detail.attachments.push({ id: resolved.id, name: resolved.name, size: resolved.size });
      } catch { detail.unavailableAttachments.push({ id: file.id, name: file.name }); }
    }
    if (restored.context.documentContext && isKnowledgeHubEnabled()) {
      const context = restored.context.documentContext;
      try {
        const resource = await getSiteKnowledgeHub().get(context.resourceId, context.versionId);
        detail.documentContext = { resourceId: resource.id, versionId: resource.version.id, title: resource.title, source: resource.source };
      } catch { /* Revoked or retired documents are never restored as active context. */ }
    }
    if (restored.context.skillContext) {
      const context = restored.context.skillContext;
      try {
        if (!isKnowledgeHubEnabled()) throw new Error("Knowledge hub unavailable");
        detail.skillContext = await resolveHermitSkillContext(getSiteKnowledgeHub(), context);
      } catch {
        detail.unavailableSkillContext = { ...context, message: "原来选择的平台 Skill 已不可用，请重新选择后再使用。" };
      }
    }
    return Response.json(detail, { headers });
  } catch (error) { return authErrorResponse(error); }
}
