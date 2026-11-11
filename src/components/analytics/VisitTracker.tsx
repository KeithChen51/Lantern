"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { WebSession } from "@/components/auth/auth-fetch";
import { visitModuleForPath } from "@/modules/analytics/visit-modules";
import { createVisitReporter, visitNavigationKey } from "./VisitReporter";
import styles from "./VisitTracker.module.css";

const VISIT_NOTICE = {
  employee: {
    storageKey: "lighthouse-visit-notice:v2:employee",
    description: "员工访问按账号和部门统计。所有平台管理员都能查看实名的员工访问和 AI 对话 Top 10，查看操作会留痕。",
  },
  guest: {
    storageKey: "lighthouse-visit-notice:v1:guest",
    description: "访客按匿名标识统计，不进入员工或部门排行。",
  },
  dealer: {
    storageKey: "lighthouse-visit-notice:v1:dealer",
    description: "比亚迪汽车企微的访问人数按账号去重，平台管理员仅查看汇总数据。",
  },
};

function subscribeNotice(change: () => void) {
  window.addEventListener("storage", change);
  return () => window.removeEventListener("storage", change);
}

export function VisitTracker({ session }: { session: WebSession }) {
  const pathname = usePathname();
  const params = useSearchParams();
  // Only a search term changes the displayed page within the same pathname.
  // This temporary key is never sent to the collector or written to storage.
  const navigationKey = visitNavigationKey(pathname, params);
  const { storageKey, description } = VISIT_NOTICE[session.kind ?? "employee"];
  const noticeKey = `${storageKey}:${session.user.id}`;
  const [notice, setNotice] = useState<{ owner: string; acknowledged: boolean } | null>(null);
  const stored = useSyncExternalStore<boolean | null>(subscribeNotice, () => {
    try { return localStorage.getItem(storageKey) === session.user.id; } catch { return false; }
  }, () => null);
  const acknowledged = stored || notice?.owner === noticeKey && notice.acknowledged;
  const reporter = useRef<ReturnType<typeof createVisitReporter> | null>(null);

  useEffect(() => {
    if (!acknowledged || !session.csrfToken || session.expiresAt <= Date.now()) {
      reporter.current?.stop();
      reporter.current = null;
      return;
    }
    const owner = `${noticeKey}:${session.csrfToken}`;
    if (reporter.current?.owner !== owner) reporter.current = createVisitReporter(owner, session.csrfToken, session.expiresAt);
    const current = reporter.current;
    current.resume();
    const targetModule = visitModuleForPath(pathname);
    current.enter(navigationKey, targetModule);
    const visible = () => {
      if (document.visibilityState === "visible") current.show();
    };
    visible();
    document.addEventListener("visibilitychange", visible);
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) { current.restore(); visible(); }
    };
    window.addEventListener("pageshow", restored);
    return () => {
      current.stop();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", restored);
    };
  }, [acknowledged, navigationKey, noticeKey, pathname, session.csrfToken, session.expiresAt]);

  if (stored === null || acknowledged || !visitModuleForPath(pathname)) return null;
  return (
    <aside className={styles.notice} aria-label="访问记录说明">
      <div>
        <strong>访问记录说明</strong>
        <p>灯塔记录业务页面访问，用于分析使用情况和改进内容。{description}访问明细保留 180 天，不含个人标识的日汇总保留 24 个月。如需了解记录或提出请求，请联系平台负责人。</p>
      </div>
      <button type="button" onClick={() => {
        try { localStorage.setItem(storageKey, session.user.id); } catch { /* Acknowledgment still applies in memory. */ }
        setNotice({ owner: noticeKey, acknowledged: true });
      }}>知道了</button>
    </aside>
  );
}
