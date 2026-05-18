"use client";

import * as React from "react";
import { ShieldCheck, UserRound } from "lucide-react";
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
  return role === "highest_admin" ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />;
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
      className="flex shrink-0 items-center rounded-full border border-ink/10 bg-white/45 p-1 shadow-sm backdrop-blur-sm"
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
              "inline-flex h-9 min-w-9 items-center justify-center gap-2 rounded-full px-2.5 text-xs font-medium transition-colors disabled:cursor-wait",
              isActive ? "bg-ink text-paper shadow-sm" : "text-ink/55 hover:bg-ink/5 hover:text-ink",
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
