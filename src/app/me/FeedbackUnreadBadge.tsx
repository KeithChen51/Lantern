"use client";

import { useEffect, useState } from "react";
import { LhStatusBadge } from "@/components/ui/lighthouse-primitives";

export function FeedbackUnreadBadge() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    let latest = 0;
    const refresh = async () => {
      const sequence = ++latest;
      try {
        const response = await fetch("/api/feedback/notifications", { cache: "no-store" });
        if (!response.ok) { if (active && sequence === latest && [401, 403].includes(response.status)) setUnread(0); return; }
        const payload = await response.json();
        const count = payload?.data?.unreadCount;
        if (active && sequence === latest && Number.isSafeInteger(count) && count >= 0) setUnread(count);
      } catch { /* The board itself provides an explicit retry state. */ }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("lighthouse:feedback-notifications-read", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("lighthouse:feedback-notifications-read", refresh);
    };
  }, []);
  return unread ? <LhStatusBadge tone="info" aria-label={`${unread} 条未读建议通知`}>{unread > 99 ? "99+" : unread} 条新回应</LhStatusBadge> : null;
}
