"use client";

import { useReleaseUnread } from "@/components/layout/release-read-state";
import { LhChip } from "@/components/ui/lighthouse-primitives";

export function ReleaseUnreadBadge() {
  const unread = useReleaseUnread();
  if (!unread) return null;

  return (
    <LhChip tone="primary">
      <span aria-hidden="true" lang="en">NEW</span>
      <span className="sr-only">有未读版本消息</span>
    </LhChip>
  );
}
