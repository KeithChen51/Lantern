export type WebSession = {
  kind?: "employee" | "guest";
  user: { id: string; account: string; displayName: string; organization?: string; avatarUrl?: string };
  capabilities: readonly string[];
  csrfToken: string;
  expiresAt: number;
};

let browserSession: WebSession | null = null;

// SessionProvider owns this in-memory identity. Never store credentials here
// across page loads or adopt a replacement identity while a write is pending.
export function registerBrowserSession(session: WebSession): () => void {
  browserSession = session;
  return () => { if (browserSession === session) browserSession = null; };
}

export class AuthRequestError extends Error {
  constructor(public readonly status: number, kind?: WebSession["kind"]) {
    super(status === 401 ? kind === "guest" ? "访客会话已更新，请重新打开页面后重试。" : "登录已失效，请重新登录。" : status === 403 ? "没有执行此操作的权限，请刷新页面或联系管理员。" : "服务暂不可用，请稍后重试。");
  }
}

function recoverSession(kind: WebSession["kind"], identityChanged = false) {
  if (typeof window === "undefined") return;
  window.location.assign(kind === "guest" || identityChanged ? "/" : `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
}

function handleAuthStatus(response: Response) {
  if (![401, 403, 503].includes(response.status)) return;
  if (response.status === 401) recoverSession(browserSession?.kind);
  throw new AuthRequestError(response.status, browserSession?.kind);
}

function hasSameOwner(session: WebSession, owner: WebSession | null) {
  return !owner || (session.user?.id === owner.user.id && (session.kind ?? "employee") === (owner.kind ?? "employee"));
}

export async function readWebSession(signal?: AbortSignal | null): Promise<WebSession> {
  const owner = browserSession;
  const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}) });
  handleAuthStatus(response);
  if (!response.ok) throw new Error("读取登录状态失败，请重试。");
  const session = await response.json() as WebSession;
  if (!hasSameOwner(session, owner) || !hasSameOwner(session, browserSession)) {
    recoverSession(session.kind, true);
    throw new AuthRequestError(401, session.kind);
  }
  if (!session.csrfToken) {
    recoverSession(session.kind);
    throw new AuthRequestError(401, session.kind);
  }
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
