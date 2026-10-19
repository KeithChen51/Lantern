import type { Principal } from "@/modules/auth/access";
import { AppError } from "@/shared/errors";

/** Hermit accepts only the trusted employee or guest web principal supplied by auth. */
export function assertHermitPrincipal(principal: Principal, capability: "hermit:chat" | "hermit:attachment:self") {
  if (principal.channel !== "web" || !principal.userId || !principal.grantId || !principal.credentialId || principal.expiresAt <= Date.now()) {
    throw new AppError("unauthorized", "请重新登录。", 401);
  }
  if (!principal.capabilities.includes(capability)) throw new AppError("forbidden", "没有使用路引的权限。", 403);
}
