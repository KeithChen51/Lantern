export type WebSession = {
  user: { id: string; account: string; displayName: string; organization?: string; avatarUrl?: string };
  capabilities: readonly string[];
  csrfToken: string;
  expiresAt: number;
};

export class AuthRequestError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 ? "登录已失效，请重新登录。" : status === 403 ? "没有执行此操作的权限，请刷新页面或联系管理员。" : "服务暂不可用，请稍后重试。");
  }
}

function handleAuthStatus(response: Response) {
  if (![401, 403, 503].includes(response.status)) return;
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.assign(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
  throw new AuthRequestError(response.status);
}

export async function readWebSession(signal?: AbortSignal | null): Promise<WebSession> {
  const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}) });
  handleAuthStatus(response);
  if (!response.ok) throw new Error("读取登录状态失败，请重试。");
  const session = await response.json() as WebSession;
  if (!session.csrfToken) throw new AuthRequestError(401);
  return session;
}

// Refresh CSRF from the opaque cookie for each mutation. Never persist a
// credential in browser storage, send it off origin, or retry a write silently.
export const authFetch: typeof fetch = async (input, init) => {
  const base = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const target = new URL(input instanceof Request ? input.url : input.toString(), base);
  if (target.origin !== base || !target.pathname.startsWith("/api/")) throw new Error("请求必须指向本站接口。");
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const requestHeaders = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) requestHeaders.set("x-csrf-token", (await readWebSession(signal)).csrfToken);
  const response = await fetch(input, { ...init, headers: requestHeaders, credentials: "same-origin", cache: "no-store" });
  handleAuthStatus(response);
  return response;
};
