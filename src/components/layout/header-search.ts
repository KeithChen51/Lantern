export type HeaderSearchTarget = {
  href: string;
  label: string;
  description: string;
  keywords: string[];
};

export const HEADER_SEARCH_TARGETS: HeaderSearchTarget[] = [
  {
    href: "/",
    label: "本心",
    description: "价值起点：理解精诚服务的判断标准。",
    keywords: ["heart", "本心", "首页", "价值起点", "价值观", "文化", "真善美爱"],
  },
  {
    href: "/mirror",
    label: "镜鉴",
    description: "外部标杆：看行业观察、标杆企业和服务案例。",
    keywords: ["mirror", "镜鉴", "外部标杆", "标杆", "案例", "胖东来"],
  },
  {
    href: "/action",
    label: "笃行",
    description: "内部实践：复盘真实服务场景和判断训练。",
    keywords: ["action", "笃行", "内部实践", "行动", "实践", "训练", "合作伙伴", "代驾", "休息区"],
  },
  {
    href: "/workshop",
    label: "行动指南",
    description: "提交和浏览岗位应做/避免建议。",
    keywords: ["workshop", "共创", "行动指南", "do", "dont", "指南", "提交", "应做", "避免"],
  },
  {
    href: "/admin/workshop",
    label: "指南审核",
    description: "管理员审核和发布行动指南。",
    keywords: ["admin", "审核", "管理", "发布", "队列", "管理员"],
  },
  {
    href: "/hermit",
    label: "路引",
    description: "AI问答：直接描述服务场景，获得判断依据和下一步话术。",
    keywords: ["hermit", "路引", "AI问答", "ai问答", "ai", "问答", "决策", "对话"],
  },
];

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

export function getHeaderSearchMatches(query: string, limit = HEADER_SEARCH_TARGETS.length) {
  const normalizedQuery = normalizeSearchTerm(query);
  return HEADER_SEARCH_TARGETS.filter((target) => targetMatchesQuery(target, normalizedQuery)).slice(0, limit);
}

export function resolveHeaderSearch(query: string) {
  const normalizedQuery = normalizeSearchTerm(query);
  if (!normalizedQuery) return null;
  return getHeaderSearchMatches(normalizedQuery, 1)[0] ?? null;
}
