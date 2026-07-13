import { AppError } from "@/shared/errors";
import type { FeedbackIssuePayload, FeedbackIssueReference } from "@/modules/feedback/types";

type Environment = Record<string, string | undefined>;

export type IssueFetch = (input: string, init?: RequestInit) => Promise<Response>;

type DevOpsIssueConfig = {
  issuesUrl: string;
  authMode: "authorization-token";
  token: string;
};

function readDevOpsIssueConfig(env: Environment = process.env): DevOpsIssueConfig {
  const issuesUrl = env.BYD_DEVOPS_ISSUES_API_URL?.trim();
  const token = env.BYD_DEVOPS_TOKEN?.trim();
  const authMode = env.BYD_DEVOPS_AUTH_MODE?.trim() || "authorization-token";

  if (!issuesUrl || !token) {
    throw new AppError("integration_error", "反馈通道尚未配置，请联系管理员。", 503);
  }

  if (authMode !== "authorization-token") {
    throw new AppError("integration_error", "反馈通道鉴权配置无效，请联系管理员。", 503);
  }

  return { issuesUrl, authMode, token };
}

function normalizeIssueReference(value: unknown): FeedbackIssueReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { number: null, url: null };
  }

  const issue = value as Record<string, unknown>;
  const rawNumber = issue.number ?? issue.iid ?? issue.id;
  const rawUrl = issue.html_url ?? issue.web_url ?? issue.url;

  return {
    number: typeof rawNumber === "string" || typeof rawNumber === "number" ? String(rawNumber) : null,
    url: typeof rawUrl === "string" ? rawUrl : null,
  };
}

export async function createDevOpsIssue(
  payload: FeedbackIssuePayload,
  env: Environment = process.env,
  fetchImpl: IssueFetch = fetch,
) {
  const config = readDevOpsIssueConfig(env);

  let response: Response;
  try {
    response = await fetchImpl(config.issuesUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `token ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: payload.title, body: payload.body }),
    });
  } catch {
    throw new AppError("integration_error", "反馈暂时未提交，请检查网络后重试。", 502);
  }

  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? "反馈通道鉴权失败，请联系管理员。"
      : "反馈暂时未提交，请稍后重试。";
    throw new AppError("integration_error", message, 502);
  }

  const responseBody = await response.json().catch(() => null);
  return normalizeIssueReference(responseBody);
}
