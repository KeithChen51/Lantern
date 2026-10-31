"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { WebSession } from "@/components/auth/auth-fetch";
import { visitModuleForPath } from "@/modules/analytics/visit-modules";
import { createVisitReporter, visitNavigationKey } from "./VisitReporter";
import styles from "./VisitTracker.module.css";

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
  const noticeKey = `lighthouse-visit-notice:v1:${session.kind ?? "employee"}:${session.user.id}`;
  const storageKey = `lighthouse-visit-notice:v1:${session.kind ?? "employee"}`;
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
        <p>灯塔记录业务页面访问，用于分析使用情况和改进内容。{session.kind === "guest" ? "访客按匿名标识统计，不进入员工或部门排行。" : "员工访问关联账号及身份源提供的部门，用于使用排行；实名员工榜由获专项授权的管理员填写事由后查询。"}访问明细保留 180 天，不含个人标识的日汇总保留 24 个月。如需了解记录或提出请求，请联系平台负责人。</p>
      </div>
      <button type="button" onClick={() => {
        try { localStorage.setItem(storageKey, session.user.id); } catch { /* Acknowledgment still applies in memory. */ }
        setNotice({ owner: noticeKey, acknowledged: true });
      }}>知道了</button>
    </aside>
  );
}
