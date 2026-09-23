import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { isGamesModuleEnabled } from "@/config/features";

const VISIBLE_MODULE_NAMES = [
  "本心",
  "镜鉴",
  "笃行",
  ...(isGamesModuleEnabled() ? ["启航"] : []),
  "路引",
];

export const metadata: Metadata = {
  title: "灯塔 丨 服务文化数字平台",
  description: `服务品牌升级内部展示平台：${VISIBLE_MODULE_NAMES.join("、")}。`,
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
