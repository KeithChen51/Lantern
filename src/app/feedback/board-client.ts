"use client";

import { useEffect, useState } from "react";
import { clearSuggestionDraft } from "./suggestion-draft";

const ACCESS_RECOVERY = "员工登录或操作权限已失效，请刷新页面；仍无法操作时，请从“我的”重新登录员工账号。";
type PrivateScope = { revision: number; listeners: Set<() => void> };
const privateScopes = new Map<string, PrivateScope>();
function privateScope(owner: string): PrivateScope {
  let scope = privateScopes.get(owner);
  if (!scope) { scope = { revision: 0, listeners: new Set() }; privateScopes.set(owner, scope); }
  return scope;
}

/** A pending write cannot refresh or restore resources after any authorization denial. */
export function captureBoardAuthorization(owner: string): () => boolean {
  const scope = privateScope(owner);
  const revision = scope.revision;
  return () => scope.revision === revision;
}

export function subscribeBoardAuthorization(owner: string, listener: () => void): () => void {
  const scope = privateScope(owner);
  scope.listeners.add(listener);
  return () => { scope.listeners.delete(listener); };
}

export class BoardRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function boardRequest<T>(url: string, options?: { method: string; body?: unknown; csrfToken: string }, owner?: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...(options ? { method: options.method, headers: { "Content-Type": "application/json", "x-csrf-token": options.csrfToken }, body: JSON.stringify(options.body ?? {}) } : {}),
  });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      if (owner) {
        clearSuggestionDraft(owner);
        const scope = privateScope(owner);
        scope.revision += 1;
        for (const listener of scope.listeners) listener();
      }
      throw new BoardRequestError(ACCESS_RECOVERY, response.status);
    }
    if (response.status === 409) throw new BoardRequestError("建议已被其他管理员更新。请刷新详情，核对最新状态后重新提交；你的回应草稿已保留。", 409);
    throw new Error(payload?.error?.message || "操作未完成，请稍后重试。");
  }
  if (!payload || !("data" in payload)) throw new Error("暂时无法读取返回内容，请重试。");
  return payload.data as T;
}

export async function markBoardNotificationsRead(ids: string[], csrfToken: string, owner: string, onBatch: (ids: string[]) => void): Promise<void> {
  const unique = [...new Set(ids)];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    await boardRequest("/api/feedback/notifications", { method: "PATCH", body: { ids: batch }, csrfToken }, owner);
    onBatch(batch);
  }
}

export function useBoardResource<T>(url: string, owner: string) {
  const [version, setVersion] = useState(0);
  const key = `${owner}:${url}:${version}`;
  const scope = privateScope(owner);
  const revision = scope.revision;
  const [result, setResult] = useState<{ key: string; url: string; owner: string; data?: T; error?: string }>({ key: "", url: "", owner: "" });
  useEffect(() => {
    let active = true;
    const requestRevision = scope.revision;
    const denied = () => { if (active) setResult({ key, url, owner, error: ACCESS_RECOVERY }); };
    scope.listeners.add(denied);
    boardRequest<T>(url, undefined, owner).then(
      (data) => { if (active && requestRevision === scope.revision) setResult({ key, url, owner, data }); },
      (error: unknown) => {
        if (!active || requestRevision !== scope.revision) return;
        setResult((previous) => ({ key, url, owner, data: previous.url === url && previous.owner === owner ? previous.data : undefined, error: error instanceof Error ? error.message : "加载失败，请重试。" }));
      },
    );
    return () => { active = false; scope.listeners.delete(denied); };
  }, [url, owner, key, scope]);
  return {
    data: result.url === url && result.owner === owner ? result.data : undefined,
    error: result.key === key ? result.error : undefined,
    loading: result.key !== key,
    reload: () => setVersion((value) => value + 1),
    update: (next: T | ((current: T | undefined) => T | undefined)) => {
      if (scope.revision !== revision) return;
      setResult((previous) => ({ key, url, owner, data: typeof next === "function" ? (next as (current: T | undefined) => T | undefined)(previous.owner === owner && previous.url === url ? previous.data : undefined) : next }));
    },
  };
}
