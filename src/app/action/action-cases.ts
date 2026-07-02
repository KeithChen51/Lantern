import { FINAL_CANWU_ACTION_CASES } from "./final-canwu-action-cases";

export type ActionCaseSourceMaterial = {
  type: "访谈转写" | "分析报告" | "润色稿" | "政策文件";
  title: string;
  path?: string;
  note: string;
  visibility: "public" | "maintainer_only";
};

export type ActionCaseCognitiveFrame = {
  label: string;
  focus: string;
  question: string;
};

export type ActionCaseOption = {
  label: string;
  description: string;
  customerEffect: string;
  storeEffect: string;
};

export type ActionCaseDecisionNode = {
  title: string;
  trigger: string;
  options: ActionCaseOption[];
  finalChoice: string;
  impacts: {
    customer: string;
    store: string;
    compliance: string;
  };
  riskControl: string;
  status: "已落地" | "需持续观察";
};

export type ActionCaseMetadata = {
  contentType: "action_case";
  module: "action";
  title: string;
  shortTitle: string;
  kicker: string;
  date: string;
  audience: string[];
  roles: string[];
  serviceScenarios: string[];
  tags: string[];
  visibility: "internal";
  owner: string;
  status: "draft" | "published";
  version: string;
  imageUrl?: string;
};

export type ActionCaseBrief = {
  oneLine: string;
  learningGoal: string;
  caseQuestion: string;
};

export type StructuredActionCase = {
  schemaVersion: 1;
  kind: "structured";
  slug: string;
  href: string;
  metadata: ActionCaseMetadata;
  brief: ActionCaseBrief;
  background: {
    context: string;
    trigger: string;
  };
  caseBody: {
    paragraphs: string[];
    positiveOutcomes: string[];
  };
  cognitiveFrames: ActionCaseCognitiveFrame[];
  decisionNodes: ActionCaseDecisionNode[];
  finalPractice: string[];
  storeTakeaways: {
    title: string;
    body: string;
  }[];
  reusablePrinciples: string[];
  evidence: {
    sourceMaterials: ActionCaseSourceMaterial[];
    sourceNotes: string[];
  };
};

export type MarkdownActionCase = {
  schemaVersion: 1;
  kind: "markdown";
  slug: string;
  href: string;
  metadata: ActionCaseMetadata;
  brief: ActionCaseBrief;
  markdown: string;
  headings: Array<{ level: number; title: string }>;
  evidence: {
    sourceMaterials: ActionCaseSourceMaterial[];
    sourceNotes: string[];
  };
};

export type ActionCase = StructuredActionCase | MarkdownActionCase;

export const ACTION_CASES: ActionCase[] = FINAL_CANWU_ACTION_CASES;

export function isStructuredActionCase(actionCase: ActionCase): actionCase is StructuredActionCase {
  return actionCase.kind === "structured";
}

export function isMarkdownActionCase(actionCase: ActionCase): actionCase is MarkdownActionCase {
  return actionCase.kind === "markdown";
}

export function getActionCaseBySlug(slug: string) {
  return ACTION_CASES.find((actionCase) => actionCase.slug === slug);
}
