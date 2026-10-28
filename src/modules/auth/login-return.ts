import { safeReturnTo } from "./page-access";

export function loginRetryHref(returnTo?: unknown, error?: "callback"): string {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  const target = safeReturnTo(returnTo);
  if (target !== "/") params.set("returnTo", target);
  return "/login" + (params.size ? `?${params}` : "");
}
