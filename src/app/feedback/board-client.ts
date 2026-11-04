"use client";

import { useEffect, useState } from "react";

export async function boardRequest<T>(url: string, options?: { method: string; body?: unknown; csrfToken: string }): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...(options ? { method: options.method, headers: { "Content-Type": "application/json", "x-csrf-token": options.csrfToken }, body: JSON.stringify(options.body ?? {}) } : {}),
  });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("员工登录或操作权限已失效，请刷新页面；仍无法操作时，请从“我的”重新登录员工账号。");
    if (response.status === 409) throw new Error("建议已被其他管理员更新。请刷新详情，核对最新状态后重新提交；你的回应草稿已保留。");
    throw new Error(payload?.error?.message || "操作未完成，请稍后重试。");
  }
  if (!payload || !("data" in payload)) throw new Error("暂时无法读取返回内容，请重试。");
  return payload.data as T;
}

export function useBoardResource<T>(url: string) {
  const [version, setVersion] = useState(0);
  const key = `${url}:${version}`;
  const [result, setResult] = useState<{ key: string; url: string; data?: T; error?: string }>({ key: "", url: "" });
  useEffect(() => {
    let active = true;
    boardRequest<T>(url).then(
      (data) => { if (active) setResult({ key, url, data }); },
      (error: unknown) => { if (active) setResult((previous) => ({ key, url, data: previous.url === url ? previous.data : undefined, error: error instanceof Error ? error.message : "加载失败，请重试。" })); },
    );
    return () => { active = false; };
  }, [url, key]);
  return {
    data: result.url === url ? result.data : undefined,
    error: result.key === key ? result.error : undefined,
    loading: result.key !== key,
    reload: () => setVersion((value) => value + 1),
    update: (data: T) => setResult({ key, url, data }),
  };
}
