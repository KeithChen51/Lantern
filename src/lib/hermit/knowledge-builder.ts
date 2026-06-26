export type KnowledgeSourceType =
  | "manual"
  | "heart"
  | "mirror_case"
  | "action_case"
  | "workshop_guide"
  | "norm_file"
  | "training";

export type KnowledgeEvidenceTier = "exact" | "analogous";

export type KnowledgeSourceDocument = {
  id: string;
  source: string;
  sourceType: KnowledgeSourceType;
  evidenceTier: KnowledgeEvidenceTier;
  title: string;
  content: string;
};

export type KnowledgeChunkDraft = {
  id: string;
  source: string;
  sourceType: KnowledgeSourceType;
  evidenceTier: KnowledgeEvidenceTier;
  heading: string;
  content: string;
};

export type PublishedGuideKnowledgeInput = {
  id: string;
  title: string;
  roleName: string;
  serviceScenario: string | null;
  principleRef: string | null;
  doText: string;
  howText: string | null;
  dontText: string;
  publishedAt: Date;
};

export type ActionCaseKnowledgeInput = {
  slug: string;
  metadata: {
    title: string;
    status: "draft" | "published" | "archived";
    roles?: string[];
    serviceScenarios?: string[];
    tags?: string[];
  };
  brief: {
    oneLine: string;
    caseQuestion: string;
  };
  decisionNodes?: Array<{
    title: string;
    trigger?: string;
    finalChoice: string;
  }>;
  finalPractice?: string[];
  reusablePrinciples?: string[];
};

export type ContentItemKnowledgeInput = {
  id: string;
  title: string;
  contentType: KnowledgeSourceType;
  bodyMarkdown: string;
  updatedAt: Date;
};

export type MarkdownKnowledgeInput = {
  id: string;
  source: string;
  sourceType: KnowledgeSourceType;
  evidenceTier?: KnowledgeEvidenceTier;
  title: string;
  content: string;
};

const MIN_CHUNK_CONTENT_LENGTH = 20;
const MAX_CHUNK_CONTENT_LENGTH = 1_000;

function compact(items: Array<string | null | undefined>) {
  return items.map((item) => item?.trim()).filter((item): item is string => Boolean(item));
}

function bulletList(items: string[] | undefined) {
  return compact(items ?? []).map((item) => `- ${item}`).join("\n");
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function splitLongContent(document: KnowledgeSourceDocument): Array<{ heading: string; content: string }> {
  if (document.content.length <= MAX_CHUNK_CONTENT_LENGTH) {
    return [{ heading: document.title, content: document.content.trim() }];
  }

  const sections = document.content.split(/^##\s+/m);
  return sections
    .map((section, index) => {
      const trimmed = section.trim();
      if (!trimmed) return null;

      if (index === 0) {
        return { heading: document.title, content: trimmed.replace(/^#\s+.+\n?/, "").trim() };
      }

      const [headingLine = document.title, ...rest] = trimmed.split("\n");
      return {
        heading: `${document.title} > ${headingLine.trim()}`,
        content: rest.join("\n").trim(),
      };
    })
    .filter((item): item is { heading: string; content: string } => Boolean(item?.content));
}

export function formatMarkdownKnowledgeDocument(input: MarkdownKnowledgeInput): KnowledgeSourceDocument {
  return {
    id: input.id,
    source: input.source,
    sourceType: input.sourceType,
    evidenceTier: input.evidenceTier ?? "analogous",
    title: input.title,
    content: input.content.trim(),
  };
}

export function formatPublishedGuideKnowledgeDocument(input: PublishedGuideKnowledgeInput): KnowledgeSourceDocument {
  const parts = compact([
    `# ${input.title}`,
    `类型：Workshop 已发布 Do / Don't 指南`,
    `角色：${input.roleName}`,
    input.serviceScenario ? `场景：${input.serviceScenario}` : null,
    input.principleRef ? `关联原则：${input.principleRef}` : null,
    `发布时间：${isoDate(input.publishedAt)}`,
    `## Do`,
    input.doText,
    input.howText ? `## How\n${input.howText}` : null,
    `## Don't`,
    input.dontText,
  ]);

  return {
    id: `workshop-guide:${input.id}`,
    source: `Workshop 已发布指南 / ${input.title}`,
    sourceType: "workshop_guide",
    evidenceTier: "exact",
    title: input.title,
    content: parts.join("\n\n"),
  };
}

export function formatActionCaseKnowledgeDocuments(inputs: ActionCaseKnowledgeInput[]): KnowledgeSourceDocument[] {
  return inputs
    .filter((input) => input.metadata.status !== "archived")
    .map((input) => {
      const decisions = (input.decisionNodes ?? [])
        .map((node) =>
          compact([
            `### ${node.title}`,
            node.trigger ? `触发条件：${node.trigger}` : null,
            `最终选择：${node.finalChoice}`,
          ]).join("\n"),
        )
        .join("\n\n");

      const content = compact([
        `# ${input.metadata.title}`,
        `类型：Action 内部实践案例`,
        bulletList(input.metadata.roles)?.length ? `适用角色：\n${bulletList(input.metadata.roles)}` : null,
        bulletList(input.metadata.serviceScenarios)?.length
          ? `服务场景：\n${bulletList(input.metadata.serviceScenarios)}`
          : null,
        bulletList(input.metadata.tags)?.length ? `标签：\n${bulletList(input.metadata.tags)}` : null,
        `## 案例问题\n${input.brief.caseQuestion}`,
        `## 案例摘要\n${input.brief.oneLine}`,
        decisions ? `## 关键判断\n${decisions}` : null,
        bulletList(input.finalPractice)?.length ? `## 可复用做法\n${bulletList(input.finalPractice)}` : null,
        bulletList(input.reusablePrinciples)?.length
          ? `## 可复用原则\n${bulletList(input.reusablePrinciples)}`
          : null,
      ]).join("\n\n");

      return {
        id: `action-case:${input.slug}`,
        source: `Action 案例库 / ${input.metadata.title}`,
        sourceType: "action_case" as const,
        evidenceTier: input.metadata.status === "published" ? ("exact" as const) : ("analogous" as const),
        title: input.metadata.title,
        content,
      };
    });
}

export function formatContentItemKnowledgeDocument(input: ContentItemKnowledgeInput): KnowledgeSourceDocument {
  return {
    id: `content-item:${input.id}`,
    source: `管理端发布内容 / ${input.title}`,
    sourceType: input.contentType,
    evidenceTier: "exact",
    title: input.title,
    content: compact([
      `# ${input.title}`,
      `类型：${input.contentType}`,
      `更新时间：${isoDate(input.updatedAt)}`,
      input.bodyMarkdown,
    ]).join("\n\n"),
  };
}

export function buildKnowledgeChunks(documents: KnowledgeSourceDocument[]): KnowledgeChunkDraft[] {
  return documents.flatMap((document) =>
    splitLongContent(document)
      .filter((section) => section.content.length >= MIN_CHUNK_CONTENT_LENGTH)
      .map((section, index) => ({
        id: `${document.id}#${index}`,
        source: document.source,
        sourceType: document.sourceType,
        evidenceTier: document.evidenceTier,
        heading: section.heading,
        content: section.content,
      })),
  );
}
