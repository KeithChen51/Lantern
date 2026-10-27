import type { Metadata } from "next";
import "./globals.css";
import "./visual-v3.css";
import "./input-focus.css";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireSiteVisitor } from "@/modules/auth/access";
import { isPublicAuthPage, REQUEST_PATH_HEADER } from "@/modules/auth/page-access";
import { getWatermarkSdkUrl } from "@/modules/watermark/config";

export const metadata: Metadata = {
  title: "灯塔 丨 服务文化数字平台",
  description: "服务文化数字平台。",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const requestPath = requestHeaders.get(REQUEST_PATH_HEADER) ?? "/";
  let content = <main>{children}</main>;
  if (!isPublicAuthPage(requestPath)) {
    let principal;
    try {
      principal = await requireSiteVisitor(requestHeaders);
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && error.status === 401) redirect("/login");
      return <html lang="zh-CN"><body><main role="alert">统一登录服务暂不可用，请稍后重试。</main></body></html>;
    }
    // Public login HTML never renders or loads the business shell.
    const { AppShell } = await import("@/components/layout/AppShell");
    content = <AppShell watermarkSdkUrl={principal.kind === "guest" ? null : getWatermarkSdkUrl()} session={{ kind: principal.kind, user: { id: principal.userId, account: principal.account, displayName: principal.displayName, organization: principal.organization }, capabilities: principal.capabilities, csrfToken: principal.csrfToken ?? "", expiresAt: principal.expiresAt }}>{children}</AppShell>;
  }
  return (
    <html
      lang="zh-CN"
      data-lighthouse-interface="classic"
      suppressHydrationWarning
    >
      <body className="antialiased" suppressHydrationWarning>
        {content}
      </body>
    </html>
  );
}
