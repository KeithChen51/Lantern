import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { isPublicWorkshopEnabled } from "@/config/features";

export const metadata: Metadata = {
  title: "灯塔 丨 服务文化数字平台",
  description: isPublicWorkshopEnabled()
    ? "服务品牌升级内部展示平台：本心、镜鉴、笃行、共创、路引。"
    : "服务品牌升级内部展示平台：本心、镜鉴、笃行、路引。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      data-lighthouse-interface="classic"
      suppressHydrationWarning
    >
      <body className="antialiased" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
