import { isGamesModuleEnabled } from "@/config/features";

export type HeaderSearchTarget = {
  href: string;
  label: string;
  description: string;
  keywords: string[];
};

const HEART_SEARCH_TARGET: HeaderSearchTarget = {
  href: "/",
  label: "本心",
  description: "价值起点：理解精诚服务的判断标准。",
  keywords: ["heart", "本心", "首页", "价值起点", "价值观", "文化", "求真", "尽善", "致美", "大爱", "幸福"],
};

const MIRROR_SEARCH_TARGET: HeaderSearchTarget = {
  href: "/mirror",
  label: "镜鉴",
  description: "外部标杆：看行业观察、标杆企业和服务案例。",
  keywords: ["mirror", "镜鉴", "外部标杆", "标杆", "案例", "胖东来"],
};

const ACTION_SEARCH_TARGET: HeaderSearchTarget = {
  href: "/action",
  label: "笃行",
  description: "内部实践：复盘真实服务场景和判断训练。",
  keywords: ["action", "笃行", "内部实践", "行动", "实践", "训练", "合作伙伴", "代驾", "休息区"],
};

const HERMIT_SEARCH_TARGET: HeaderSearchTarget = {
  href: "/hermit",
  label: "路引",
  description: "AI问答：直接描述服务场景，获得判断依据和下一步话术。",
  keywords: ["hermit", "路引", "AI问答", "ai问答", "ai", "问答", "决策", "对话"],
};

const GAMES_SEARCH_TARGET: HeaderSearchTarget = {
  href: "/games",
  label: "启航",
  description: "文化游戏：在可参与的航程里体验服务理念与判断。",
  keywords: ["games", "启航", "文化游戏", "游戏", "互动", "航程", "航海", "彼岸榜"],
};

export function getHeaderSearchTargets() {
  const targets: HeaderSearchTarget[] = [
    HEART_SEARCH_TARGET,
    MIRROR_SEARCH_TARGET,
    ACTION_SEARCH_TARGET,
  ];
  targets.push(HERMIT_SEARCH_TARGET);
  if (isGamesModuleEnabled()) targets.push(GAMES_SEARCH_TARGET);
  return targets;
}

function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase();
}

function targetMatchesQuery(target: HeaderSearchTarget, normalizedQuery: string) {
  if (!normalizedQuery) return true;

  const candidates = [target.label, target.description, target.href, ...target.keywords].map((item) =>
    item.toLowerCase(),
  );

  return candidates.some((candidate) => candidate.includes(normalizedQuery));
}

export function getHeaderSearchMatches(query: string, limit = getHeaderSearchTargets().length) {
  const normalizedQuery = normalizeSearchTerm(query);
  return getHeaderSearchTargets().filter((target) => targetMatchesQuery(target, normalizedQuery)).slice(0, limit);
}

export function resolveHeaderSearch(query: string) {
  const normalizedQuery = normalizeSearchTerm(query);
  if (!normalizedQuery) return null;
  return getHeaderSearchMatches(normalizedQuery, 1)[0] ?? null;
}
