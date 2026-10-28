import { getSiteKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { caseEntryPrompt, MIRROR_CASE_ID, MIRROR_CASE_TITLE, type HermitCaseEntry } from "@/components/hermit/case-entry";

/** Resolve the current readable publication; a URL never supplies a trusted citation. */
export async function resolveCaseEntry(params: { from?: string | string[]; question?: string | string[] }): Promise<HermitCaseEntry | undefined> {
  const prompt = caseEntryPrompt(params);
  if (!prompt) return undefined;
  const entry: HermitCaseEntry = { prompt, title: MIRROR_CASE_TITLE, document: null };
  if (isKnowledgeHubEnabled()) {
    try {
      const resource = await getSiteKnowledgeHub().get(MIRROR_CASE_ID);
      entry.document = { id: `context:${resource.id}`, resourceId: resource.id, versionId: resource.version.id, title: resource.title, source: resource.source };
      return entry;
    } catch {
      // Missing, unpublished, inaccessible and temporarily unavailable documents
      // must never be presented as an attached or already-read source.
    }
  }
  entry.notice = "案例原文暂时无法引用，已保留问题。你可以稍后从灯塔知识中重新选择可读取的文档。";
  return entry;
}
