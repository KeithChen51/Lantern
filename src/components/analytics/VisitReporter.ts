import type { VisitModule } from "@/modules/analytics/visit-modules";

type Delivery = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type View = { key: string; module: VisitModule | null; eventId: string | null; sent: boolean };

export function visitNavigationKey(pathname: string, params: Pick<URLSearchParams, "get">): string {
  return pathname === "/search" ? `${pathname}?q=${params.get("q") ?? ""}` : pathname;
}

export function visitEventId(source: Pick<Crypto, "randomUUID" | "getRandomValues"> | undefined = globalThis.crypto): string | null {
  if (!source) return null;
  try {
    if (typeof source.randomUUID === "function") return source.randomUUID();
    const bytes = source.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch { return null; }
}

/** One in-memory navigation instance. No draft, URL or credential is persisted. */
export function createVisitReporter(owner: string, csrfToken: string, expiresAt: number,
  options: { deliver?: Delivery; uuid?: () => string | null; now?: () => number } = {}) {
  const deliver = options.deliver ?? fetch;
  const uuid = options.uuid ?? visitEventId;
  const now = options.now ?? Date.now;
  let view: View | null = null;
  let active = true;

  return {
    owner,
    resume() { active = true; },
    stop() { active = false; },
    enter(key: string, module: VisitModule | null) {
      if (view?.key === key) return;
      view = { key, module, eventId: uuid(), sent: false };
    },
    restore() {
      if (view) view = { ...view, eventId: uuid(), sent: false };
    },
    show() {
      if (!active || !view?.module || !view.eventId || view.sent || now() >= expiresAt) return;
      const pending = view;
      pending.sent = true;
      const started = now();
      const body = JSON.stringify({ v: 1, eventId: pending.eventId, module: pending.module, csrfToken });
      const send = async (attempt: number): Promise<void> => {
        if (!active || now() >= expiresAt || now() - started > 300_000) return;
        try {
          const response = await deliver("/api/analytics/visits", {
            method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true,
            headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken }, body,
          });
          if (response.ok || response.status < 500 || attempt >= 1) return;
        } catch {
          if (attempt >= 1) return;
        }
        // The same event ID and original CSRF binding are retained for a retry.
        setTimeout(() => { void send(attempt + 1); }, 1000);
      };
      void send(0);
    },
  };
}
