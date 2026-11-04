import { headers } from "next/headers";
import { AccessError, assertWebMutation, requireEmployee, requireFeedbackManager, type Principal } from "@/modules/auth/access";
import type { BoardActor, BoardViewer } from "./board-types";

function assertEmployeeWeb(principal: Principal): void {
  if (principal.kind === "guest" || principal.channel !== "web") throw new AccessError("建议板块仅向登录员工开放。", 403);
}
export function boardActor(principal: Principal): BoardActor {
  assertEmployeeWeb(principal);
  return { userId: principal.userId, canManage: principal.capabilities.includes("feedback:manage") };
}
export async function requireFeedbackPage(): Promise<BoardViewer> {
  const principal = await requireEmployee(await headers());
  assertEmployeeWeb(principal);
  return { ...boardActor(principal), displayName: principal.displayName, csrfToken: principal.csrfToken ?? "" };
}
export async function requireFeedbackRequest(request: Request, options: { manage?: boolean; write?: boolean } = {}): Promise<Principal> {
  const principal = options.manage ? await requireFeedbackManager(request) : await requireEmployee(request);
  assertEmployeeWeb(principal);
  if (options.manage && !principal.capabilities.includes("feedback:manage")) throw new AccessError("仅平台管理员可处理建议。", 403);
  if (options.write) assertWebMutation(request, principal);
  return principal;
}
/** A slow request body must not outlive its authorized session or admin role. */
export async function revalidateFeedbackWrite(request: Request, before: Principal, manage = false): Promise<Principal> {
  const current = await requireFeedbackRequest(request, { manage, write: true });
  if (["userId", "grantId", "credentialId"].some(key => current[key as keyof Principal] !== before[key as keyof Principal])) {
    throw new AccessError("登录身份已变化，请刷新后重试。", 403);
  }
  return current;
}
