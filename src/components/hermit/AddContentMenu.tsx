"use client";

import { Icon } from "@iconify/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { ConversationReadScope } from "./conversation-state";
import { contextFromResource, readContextResources, type ContextResource, type ContextResourceKind } from "./context-resources";
import type { HermitDocumentRecommendation } from "./types";
import styles from "./hermit-v3.module.css";

export function AddContentMenu({ disabled, onLocalFile, onDocument, onSkill, documentId, skillId }: {
  disabled: boolean; onLocalFile: () => void;
  onDocument?: (document: HermitDocumentRecommendation) => void;
  onSkill?: (skill: HermitDocumentRecommendation) => void;
  documentId?: string; skillId?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scopeRef = useRef(new ConversationReadScope());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ContextResourceKind | "menu">("menu");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState<ContextResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  function positionPanel() {
    const trigger = triggerRef.current, panel = panelRef.current;
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    const above = rect.top - 16, below = window.innerHeight - rect.bottom - 16;
    const placeAbove = above >= 380 || above > below;
    panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(352, window.innerWidth - 24) - 12))}px`;
    panel.style.top = placeAbove ? "auto" : `${rect.bottom + 8}px`;
    panel.style.bottom = placeAbove ? `${window.innerHeight - rect.top + 8}px` : "auto";
    panel.style.maxHeight = `${Math.max(100, placeAbove ? above - 8 : below - 8)}px`;
  }
  function close() {
    scopeRef.current.dispose();
    panelRef.current?.hidePopover();
    setOpen(false);
  }
  function navigate(next: ContextResourceKind | "menu") {
    scopeRef.current.dispose();
    setView(next); setQuery(""); setPage(0); setItems([]); setError(null); setHasMore(false);
    setLoading(next !== "menu");
  }
  useEffect(() => {
    const scope = scopeRef.current;
    return () => scope.dispose();
  }, []);
  useEffect(() => {
    if (!open) return;
    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    if (view === "menu") panelRef.current?.querySelector<HTMLButtonElement>("[data-menu-item]")?.focus();
    else searchRef.current?.focus();
    return () => { window.removeEventListener("resize", positionPanel); window.removeEventListener("scroll", positionPanel, true); };
  }, [open, view]);
  useEffect(() => {
    if (!open || view === "menu") return;
    const scope = scopeRef.current;
    const request = scope.begin();
    const timer = setTimeout(() => {
      void readContextResources(view, query, page, request.signal).then(result => {
        if (!request.current()) return;
        setItems(previous => page ? [...previous, ...result.items.filter(item => !previous.some(old => old.id === item.id && old.versionId === item.versionId))] : result.items);
        setHasMore(result.hasMore); setLoading(false);
      }).catch(cause => {
        if (request.current()) { setError(cause instanceof Error ? cause.message : "读取失败，请重试。"); setLoading(false); }
      });
    }, query ? 200 : 0);
    return () => { clearTimeout(timer); scope.dispose(); };
  }, [open, view, query, page, attempt]);

  function menuKeys(event: KeyboardEvent<HTMLDivElement>) {
    // The picker lives inside the composer form; searching must never send its draft.
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault(); return;
    }
    if (event.key === "Escape") {
      event.preventDefault(); close(); triggerRef.current?.focus(); return;
    }
    if (view !== "menu" || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("[data-menu-item]:not(:disabled)") ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[index]?.focus();
  }

  return <>
    <button ref={triggerRef} type="button" className={styles.addContentButton} aria-label="添加文件和更多内容" title="添加文件和更多内容" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} disabled={disabled}
      onClick={() => {
        if (open) { close(); return; }
        navigate("menu"); positionPanel(); panelRef.current?.showPopover(); setOpen(true);
      }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>
    <div ref={panelRef} id={id} popover="auto" role="dialog" aria-label={view === "menu" ? "添加内容" : view === "skill" ? "选择技能" : "选择灯塔知识文件"} className={styles.contentPopover} onKeyDown={menuKeys}
      onToggle={event => {
        const visible = event.currentTarget.matches(":popover-open");
        setOpen(visible);
        if (!visible) scopeRef.current.dispose();
      }}>
      {view === "menu" ? <div className={styles.contentMenu}>
        <button type="button" data-menu-item onClick={() => { close(); onLocalFile(); }}>
          <Icon icon={lighthouseIcons.publish} aria-hidden="true" /><span>本地文件<small>PDF、Word、TXT、Markdown</small></span>
        </button>
        <button type="button" data-menu-item disabled={!onDocument} onClick={() => navigate("knowledge")}>
          <Icon icon={lighthouseIcons.mirror} aria-hidden="true" /><span>灯塔知识文件<small>查找并引用知识、案例与规范</small></span><span aria-hidden="true">›</span>
        </button>
        <button type="button" data-menu-item disabled={!onSkill} onClick={() => navigate("skill")}>
          <Icon icon={lighthouseIcons.hermit} aria-hidden="true" /><span>使用技能<small>按已发布技能的方法辅助回答</small></span><span aria-hidden="true">›</span>
        </button>
        <p className={styles.contentMenuHelp}>本地文件每个最多 10 MB，每次对话最多 5 个。支持拖入；扫描 PDF 请先完成文字识别。</p>
      </div> : <>
        <div className={styles.contextPickerHeader}><button type="button" aria-label="返回添加菜单" onClick={() => navigate("menu")}>‹</button><strong>{view === "skill" ? "使用技能" : "灯塔知识文件"}</strong><button type="button" aria-label="关闭添加内容" onClick={() => { close(); triggerRef.current?.focus(); }}>×</button></div>
        <div className={styles.contextSearch}><Icon icon={lighthouseIcons.search} aria-hidden="true" /><input ref={searchRef} type="search" aria-label={view === "skill" ? "搜索技能" : "搜索知识文件"} maxLength={500} placeholder={view === "skill" ? "搜索已发布技能…" : "搜索知识、案例与规范…"} value={query} onChange={event => {
          scopeRef.current.dispose(); setQuery(event.target.value); setPage(0); setItems([]); setLoading(true); setError(null); setHasMore(false);
        }} /></div>
        <p className={styles.contextPickerHelp}>{view === "skill" ? "按技能方法辅助回答，不执行脚本或导出文件。" : "选择一份文档加入上下文，可与本地文件一起提问。"}</p>
        <div className={styles.contextResults} aria-busy={loading}>
          {items.map(item => <button type="button" key={`${item.id}:${item.versionId}`} aria-pressed={item.id === (view === "skill" ? skillId : documentId)} onClick={() => {
            close(); (view === "skill" ? onSkill : onDocument)?.(contextFromResource(item));
          }}><Icon icon={view === "skill" ? lighthouseIcons.hermit : lighthouseIcons.document} aria-hidden="true" /><span><strong title={item.title}>{item.title}</strong><small>{item.summary || `${({ notice: "通知", case: "案例", document: "文档", skill: "技能" })[item.type]} · 灯塔知识库`}</small></span>{item.id === (view === "skill" ? skillId : documentId) && <span aria-label="已添加">✓</span>}</button>)}
          {loading && <p role="status">正在查找…</p>}
          {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setError(null); setAttempt(value => value + 1); }}>重新加载</button></div>}
          {!loading && !error && !items.length && <p role="status">{query ? "没有找到匹配内容，试试其他关键词。" : view === "skill" ? "暂无可用的已发布技能。" : "暂无可读取的知识文件。"}</p>}
          {!loading && !error && hasMore && <button className={styles.contextLoadMore} type="button" onClick={() => { setLoading(true); setPage(value => value + 1); }}>加载更多</button>}
        </div>
      </>}
    </div>
  </>;
}
