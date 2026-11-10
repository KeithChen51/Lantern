import type { KnowledgeHub } from "@/modules/knowledge-hub/service";
import type { HermitConversationDocument } from "@/lib/hermit/conversation-contract";
import { AppError } from "@/shared/errors";

/** Resolve through the site reader so guest visibility and published-version rules also apply. */
export async function resolveHermitSkillContext(
  hub: Pick<KnowledgeHub, "get">,
  input: { resourceId: string; versionId: string },
): Promise<HermitConversationDocument> {
  const unavailable = () => new AppError("not_found", "所选平台 Skill 已不可访问或不在有效期内，请重新选择。", 404);
  const resource = await hub.get(input.resourceId, input.versionId).catch(() => { throw unavailable(); });
  if (resource.id !== input.resourceId || resource.version.id !== input.versionId || resource.archived ||
      !resource.version.publishedAt || !["effective", "unknown"].includes(resource.validity)) {
    throw unavailable();
  }
  if (resource.type !== "skill") throw new AppError("bad_request", "所选资料不是平台 Skill，请从 Skill 列表重新选择。", 400);
  return { resourceId: resource.id, versionId: resource.version.id, title: resource.title, source: resource.source };
}
