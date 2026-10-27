import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Navigation } from "./Navigation";
import { Header } from "./Header";
import { SessionProvider } from "@/components/auth/SessionContext";

const { unread } = vi.hoisted(() => ({ unread: vi.fn(() => false) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/me", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./release-read-state", () => ({ useReleaseUnread: unread }));

const session = { user: { id: "employee", account: "000123", displayName: "测试员工" }, capabilities: [], csrfToken: "csrf-fixture", expiresAt: 1900000000000 };

describe("my navigation entry", () => {
  it.each([false, true])("is reachable in desktop and mobile navigation with sidebar pinned=%s", (isPinned) => {
    const html = renderToStaticMarkup(<SessionProvider session={session}><Navigation isPinned={isPinned} onTogglePin={() => {}} isMobileOpen onMobileClose={() => {}} /></SessionProvider>);
    expect(html.match(/href="\/me"/g)).toHaveLength(2);
    expect(html.match(/aria-label="我的"/g)).toHaveLength(2);
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
    expect(html).toContain("测试员工");
    expect(html).not.toContain('action="/api/auth/logout"');
    expect(html).not.toContain('href="/updates"');
    expect(html).not.toContain('href="/feedback"');
    expect(html).not.toContain("data-lh-sidebar-notification-button");
    const utilityGroups = [...html.matchAll(/data-lh-sidebar-utility-group[^>]*>([\s\S]*?)<\/div>/g)];
    expect(utilityGroups).toHaveLength(2);
    for (const group of utilityGroups) expect(group[1].match(/<a /g)).toHaveLength(1);
  });

  it("keeps the personal entry in the shared nav family and describes unread updates uniquely", () => {
    unread.mockReturnValue(true);
    try {
      const longName = "测试员工姓名很长也应保持导航布局稳定";
      const html = renderToStaticMarkup(<SessionProvider session={{ ...session, user: { ...session.user, displayName: longName } }}><Navigation isPinned onTogglePin={() => {}} isMobileOpen onMobileClose={() => {}} /></SessionProvider>);
      const personalLinks = [...html.matchAll(/<a\b[^>]*data-lh-my-link[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
      expect(personalLinks).toHaveLength(2);
      for (const link of personalLinks) {
        expect(link).toContain("data-lh-nav-link");
        expect(link).toContain("data-lh-nav-copy");
        expect(link).toContain("data-lh-nav-label");
        expect(link).toContain(longName);
        expect(link).toContain("data-lh-my-notification-dot");
        expect(link).toContain("有未读版本消息");
      }
      const descriptionIds = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map(match => match[1]);
      expect(new Set(descriptionIds).size).toBe(2);
      for (const id of descriptionIds) expect(html).toContain(`id="${id}"`);
    } finally { unread.mockReturnValue(false); }
  });

  it("shows the verified employee name as a mobile header link", () => {
    const html = renderToStaticMarkup(<SessionProvider session={session}><Header isSidebarPinned={false} onOpenMobileNav={() => {}} /></SessionProvider>);
    expect(html).toContain('href="/me"');
    expect(html).toContain("测试员工");
    expect(html).toContain('aria-label="我的"');
  });

  it("shows a guest entry with browsing and AI navigation but no admin or authorization links", () => {
    const guest = { ...session, kind: "guest" as const, user: { id: "opaque-guest", account: "", displayName: "访客" }, capabilities: ["content:read", "knowledge:read", "hermit:chat", "hermit:attachment:self", "knowledge:manage"] };
    const html = renderToStaticMarkup(<SessionProvider session={guest}><Navigation isPinned onTogglePin={() => {}} isMobileOpen onMobileClose={() => {}} /><Header isSidebarPinned={false} onOpenMobileNav={() => {}} /></SessionProvider>);
    expect(html).toContain("访客");
    expect(html).toContain('href="/hermit"');
    expect(html).toContain('href="/me"');
    expect(html).not.toContain("测试员工");
    expect(html).not.toContain('href="/admin/');
    expect(html).not.toContain('href="/auth/tools"');
  });
});
