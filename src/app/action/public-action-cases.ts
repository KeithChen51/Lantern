import { actionCaseService, type ActionCaseCoverImage, type ActionCaseRecord } from "@/modules/content";
import { ACTION_CASES, type ActionCase, getActionCaseBySlug, isMarkdownActionCase } from "./action-cases";

export type PublicActionCaseSummary = {
  source: "managed" | "static";
  slug: string;
  href: string;
  title: string;
  date: string;
  tags: string[];
  status: "draft" | "published" | "archived";
  summary: string;
  question: string;
  coverImageUrl: string | null;
  highlights: string[];
};

export type PublicActionCaseDetail =
  | {
      source: "managed";
      record: ActionCaseRecord;
    }
  | {
      source: "static";
      record: ActionCase;
    };

function staticSummary(actionCase: ActionCase): PublicActionCaseSummary {
  const highlights = isMarkdownActionCase(actionCase)
    ? actionCase.headings
        .filter((heading) => heading.level === 2)
        .slice(0, 4)
        .map((heading) => heading.title)
    : actionCase.decisionNodes.map((decision) => decision.title);

  return {
    source: "static",
    slug: actionCase.slug,
    href: actionCase.href,
    title: actionCase.metadata.title,
    date: actionCase.metadata.date,
    tags: actionCase.metadata.tags,
    status: actionCase.metadata.status,
    summary: actionCase.brief.oneLine,
    question: actionCase.brief.caseQuestion,
    coverImageUrl: actionCase.metadata.imageUrl ?? null,
    highlights,
  };
}

function managedSummary(actionCase: ActionCaseRecord): PublicActionCaseSummary {
  return {
    source: "managed",
    slug: actionCase.slug,
    href: actionCase.href,
    title: actionCase.title,
    date: actionCase.date,
    tags: actionCase.tags,
    status: actionCase.status,
    summary: actionCase.summary,
    question: actionCase.headings[0]?.title ?? actionCase.title,
    coverImageUrl: actionCase.coverImage?.url ?? null,
    highlights: actionCase.headings.slice(0, 4).map((heading) => heading.title),
  };
}

export async function getPublicActionCaseSummaries() {
  const managed = await actionCaseService.listPublishedActionCases().catch(() => []);
  return managed.length > 0 ? managed.map(managedSummary) : ACTION_CASES.map(staticSummary);
}

export async function getPublicActionCaseBySlug(slug: string): Promise<PublicActionCaseDetail | null> {
  const managed = await actionCaseService.getPublishedActionCaseBySlug(slug).catch(() => null);
  if (managed) return { source: "managed", record: managed };

  const staticCase = getActionCaseBySlug(slug);
  return staticCase ? { source: "static", record: staticCase } : null;
}

export function getCoverImageUrl(coverImage: ActionCaseCoverImage | null) {
  return coverImage?.url ?? null;
}
