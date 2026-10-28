import type { HermitDocumentRecommendation } from "./types";

export const MIRROR_CASE_ID = "knowledge-mirror-pang-dong-lai";
export const MIRROR_CASE_TITLE = "云游胖东来";
const DEFAULT_QUESTION = "哪些服务做法适合迁移到汽车售后门店，需要具备什么条件？请帮助我梳理下一步可以尝试的行动。";
export interface HermitCaseEntry {
  prompt: string;
  title: string;
  document: HermitDocumentRecommendation | null;
  notice?: string;
}

/** A restoration hint only. Access and display metadata must be read again. */
export interface CaseDraftReference { resourceId: string; versionId: string }

export function caseDraftReference(value: unknown): CaseDraftReference | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CaseDraftReference>;
  return candidate.resourceId === MIRROR_CASE_ID && typeof candidate.versionId === "string" &&
    candidate.versionId.length > 0 && candidate.versionId.length <= 160
    ? { resourceId: MIRROR_CASE_ID, versionId: candidate.versionId } : null;
}

export function mirrorHermitHref(question = DEFAULT_QUESTION) {
  return `/hermit?${new URLSearchParams({ from: "mirror-pang-dong-lai", question })}`;
}

export function caseEntryPrompt(params: { from?: string | string[]; question?: string | string[] }): string | null {
  if (params.from !== "mirror-pang-dong-lai") return null;
  const question = typeof params.question === "string" && params.question.trim() && params.question.length <= 800
    ? params.question.trim() : DEFAULT_QUESTION;
  return `请结合《${MIRROR_CASE_TITLE}》案例，帮我分析：${question}`;
}

export function appendCaseQuestion(draft: string, prompt: string) {
  return draft.trim() ? `${draft}\n\n${prompt}` : prompt;
}
