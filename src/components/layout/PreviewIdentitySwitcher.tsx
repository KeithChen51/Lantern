"use client";

import * as React from "react";
import { Icon } from "@iconify/react";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { cn } from "@/lib/utils";

type PreviewIdentity = {
  id: string;
  displayName: string;
  role: "normal_user" | "highest_admin";
  label: string;
  description: string;
};

type PreviewIdentityPayload = {
  current: PreviewIdentity | null;
  identities: PreviewIdentity[];
};

async function fetchPreviewIdentity(init?: RequestInit) {
  const response = await fetch("/api/preview-identity", {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: PreviewIdentityPayload;
  };
  if (!response.ok || !payload.data) {
    throw new Error("Preview identity is unavailable.");
  }
  return payload.data;
}

function IdentityIcon({ role }: { role: PreviewIdentity["role"] }) {
  return <Icon icon={role === "highest_admin" ? lighthouseIcons.admin : lighthouseIcons.user} className="h-4 w-4" />;
}

export function PreviewIdentitySwitcher() {
  const [payload, setPayload] = React.useState<PreviewIdentityPayload | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    fetchPreviewIdentity()
      .then((nextPayload) => {
        if (isMounted) setPayload(nextPayload);
      })
      .catch(() => {
        if (isMounted) setPayload(null);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  async function switchIdentity(userId: string) {
    if (payload?.current?.id === userId || isBusy) return;
    setIsBusy(true);
    try {
      await fetchPreviewIdentity({
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      window.location.reload();
    } catch {
      setIsBusy(false);
    }
  }

  if (!payload || payload.identities.length === 0) return null;

  return (
    <div
      className="flex shrink-0 items-center rounded-sm border border-line bg-surface-quiet p-1 shadow-lh-sm"
      aria-label="体验身份"
    >
      {payload.identities.map((identity) => {
        const isActive = payload.current?.id === identity.id;
        return (
          <button
            key={identity.id}
            type="button"
            onClick={() => void switchIdentity(identity.id)}
            disabled={isBusy}
            title={`${identity.label}：${identity.description}`}
            aria-pressed={isActive}
            className={cn(
              "inline-flex h-8 min-w-8 items-center justify-center gap-2 rounded-xs px-2.5 text-xs font-bold transition-colors disabled:cursor-wait",
              isActive ? "bg-primary text-panel shadow-lh-sm" : "text-muted hover:bg-panel hover:text-ink",
            )}
          >
            <IdentityIcon role={identity.role} />
            <span className="hidden whitespace-nowrap xl:inline">{identity.label}</span>
          </button>
        );
      })}
    </div>
  );
}
