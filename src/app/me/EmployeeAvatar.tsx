"use client";

import { useState } from "react";

export function EmployeeAvatar({ displayName, avatarUrl }: { displayName: string; avatarUrl?: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  let safeUrl: string | undefined;
  try {
    const url = new URL(avatarUrl ?? "");
    if (url.protocol === "https:" && !url.username && !url.password) safeUrl = url.href;
  } catch { /* Missing or invalid URLs use the employee's initial. */ }

  return (
    <span data-lh-employee-avatar className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-primary-soft text-[length:var(--title-section)] font-[var(--weight-bold)] text-primary-text">
      {safeUrl && safeUrl !== failedUrl ? (
        // Upstream avatars load directly over HTTPS without sending a referrer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={safeUrl} alt={`${displayName}的头像`} width={80} height={80} referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setFailedUrl(safeUrl)} />
      ) : <span aria-label={`${displayName}的头像`}>{Array.from(displayName.trim())[0] || "我"}</span>}
    </span>
  );
}
