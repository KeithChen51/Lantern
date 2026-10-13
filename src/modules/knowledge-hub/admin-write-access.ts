import { requireKnowledgeAdmin, assertWebMutation } from "@/modules/auth/access";
import { AccessError, type Principal } from "@/modules/auth/access-types";

/** Revalidate after body/file parsing and immediately before each mutation. */
export async function recheckKnowledgeAdminWrite(request: Request, initial: Principal) {
  const current = await requireKnowledgeAdmin(request, { write: true });
  assertWebMutation(request, current);
  if (current.userId !== initial.userId || current.account !== initial.account ||
      current.grantId !== initial.grantId || current.credentialId !== initial.credentialId) {
    throw new AccessError("请求期间登录授权已变化，请重新提交。", 403);
  }
  return current;
}
