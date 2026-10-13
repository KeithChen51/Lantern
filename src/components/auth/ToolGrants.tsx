"use client";

import { useEffect, useState } from "react";
import { authFetch } from "./auth-fetch";
import { useEmployeeSession } from "./SessionContext";

type Grant = { id: string; name: string; createdAt: number | string; lastUsedAt: number | string | null; expiresAt: number | string };
function formatTime(value: number | string | null) { return value === null ? "尚未使用" : new Date(value).toLocaleString("zh-CN"); }

export function ToolGrants() {
  const session = useEmployeeSession();
  const [items, setItems] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError("");
    void authFetch("/api/auth/clients", { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error("工具授权暂时无法读取，请重试。");
      const payload = await response.json() as { items: Grant[] };
      if (!abort.signal.aborted) setItems(payload.items);
    }).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "读取失败，请重试。"); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [reload]);
  async function revoke(id: string) {
    setBusy(id); setError(""); setNotice("");
    try {
      const response = await authFetch(`/api/auth/clients/${encodeURIComponent(id)}/revoke`, { method: "POST" });
      if (!response.ok) throw new Error("撤销失败，请重试。");
      setItems(current => current.filter(item => item.id !== id)); setNotice("已撤销工具授权。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "撤销失败，请重试。"); }
    finally { setBusy(null); }
  }
  return <section className="mx-auto max-w-3xl space-y-6" aria-labelledby="tools-title">
    <h1 id="tools-title" className="text-[length:var(--title-page)]">我的工具授权</h1><p>仅展示当前员工账号批准的 CLI / MCP 知识读取授权。</p>
    {loading && <p role="status">正在读取授权…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setReload(value => value + 1)} disabled={busy !== null}>重试</button></div>}
    {notice && <p role="status">{notice}</p>}
    {!loading && !error && items.length === 0 && <p>当前没有工具授权。</p>}
    <ul className="space-y-4">{items.map(item => <li key={item.id} className="rounded-xl border border-line bg-panel p-4">
      <h2>{item.name}</h2><p>权限：知识读取</p><p>授权：{formatTime(item.createdAt)} · 最近使用：{formatTime(item.lastUsedAt)} · 到期：{formatTime(item.expiresAt)}</p>
      <button className="min-h-11 rounded border border-line px-4 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50" type="button" disabled={busy !== null} onClick={() => void revoke(item.id)}>{busy === item.id ? "正在撤销…" : "撤销授权"}</button>
    </li>)}</ul>
    <form action="/api/auth/logout-all" method="post"><input type="hidden" name="csrfToken" value={session?.csrfToken ?? ""} /><button className="min-h-11 rounded border border-line px-4 focus-visible:outline-2 focus-visible:outline-primary" type="submit">退出全部会话并撤销全部工具授权</button></form>
  </section>;
}
