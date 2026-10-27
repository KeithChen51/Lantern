"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useEmployeeSession } from "@/components/auth/SessionContext";
import { authFetch } from "@/components/auth/auth-fetch";
import { createWatermarkLifecycle } from "./lifecycle";
import { loadWatermarkSdk, watermarkCoordinator } from "./sdk";

export function EmployeeWatermark({ sdkUrl }: { sdkUrl?: string | null }) {
  const session = useEmployeeSession();
  const marker = useRef<HTMLSpanElement>(null);
  const active = useRef<ReturnType<typeof createWatermarkLifecycle> | null>(null);
  const kind = session?.kind;
  const userId = session?.user.id;
  const account = session?.user.account;
  const expiresAt = session?.expiresAt;
  // Remove old identity output before the replacement page paints. Start in the
  // passive effect, after SessionProvider has registered the browser identity.
  useLayoutEffect(() => () => active.current?.dispose(), [kind, userId, account, expiresAt, sdkUrl]);
  useEffect(() => {
    // Capture scalar identity/expiry, avoiding a restart on unrelated layout renders.
    const owner = userId && account && expiresAt !== undefined ? {
      kind, user: { id: userId, account, displayName: "" }, expiresAt, capabilities: [], csrfToken: "",
    } : null;
    const lifecycle = createWatermarkLifecycle(owner, sdkUrl, {
      request: authFetch, loadSdk: loadWatermarkSdk, coordinator: watermarkCoordinator,
      onStatus: status => { if (marker.current) marker.current.dataset.watermarkStatus = status; },
    });
    active.current = lifecycle;
    const visibility = () => { if (document.hidden) lifecycle.suspend(); else lifecycle.resume(); };
    const hide = () => lifecycle.suspend();
    const show = () => { if (!document.hidden) lifecycle.resume(); };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    document.addEventListener("visibilitychange", visibility);
    if (document.hidden) lifecycle.suspend(); else lifecycle.start();
    return () => {
      lifecycle.dispose();
      if (active.current === lifecycle) active.current = null;
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [kind, userId, account, expiresAt, sdkUrl]);
  return <span ref={marker} hidden aria-hidden="true" data-watermark-status="disabled" />;
}
