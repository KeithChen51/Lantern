import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { requireEmployee } from "@/modules/auth/access";
import { PageHeading } from "@/components/ui/PageHeading";
import { LhButton, LhPanel, LhStatusBadge } from "@/components/ui/lighthouse-primitives";
import { currentVersion } from "@/lib/releases";
import { EmployeeAvatar } from "./EmployeeAvatar";

export const metadata: Metadata = { title: "我的 | 灯塔" };

export default async function MyPage() {
  const principal = await requireEmployee(await headers());

  return (
    <div data-lh-page="me" className="mx-auto w-full max-w-3xl space-y-8">
      <PageHeading title="我的" />
      <LhPanel aria-label="员工信息" className="p-5 sm:p-8">
        <div className="flex items-center gap-5">
          <EmployeeAvatar displayName={principal.displayName} avatarUrl={principal.avatarUrl} />
          <div className="min-w-0 space-y-2">
            <h2 className="break-words text-[length:var(--title-section)] font-[var(--weight-bold)] text-ink">{principal.displayName}</h2>
            <LhStatusBadge tone="success">已登录</LhStatusBadge>
          </div>
        </div>
        <dl className="mt-6 grid gap-5 text-[length:var(--type-body)] leading-[var(--leading-body)] sm:grid-cols-2">
          <div><dt className="text-muted">姓名</dt><dd className="mt-1 break-words text-ink">{principal.displayName}</dd></div>
          <div><dt className="text-muted">工号</dt><dd className="mt-1 break-all text-ink">{principal.account}</dd></div>
          <div className="sm:col-span-2"><dt className="text-muted">组织架构</dt><dd className="mt-1 break-words text-ink">{principal.organization?.trim() || "暂未提供"}</dd></div>
        </dl>
      </LhPanel>
      <LhPanel aria-label="消息与反馈" className="divide-y divide-line overflow-hidden">
        <Link href="/updates" className="flex min-h-20 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-8">
          <span><span className="block text-[length:var(--type-lead)] font-[var(--weight-bold)] text-ink">版本消息</span><span className="mt-1 block text-[length:var(--type-caption)] text-muted">当前版本 v{currentVersion}</span></span>
          <span aria-hidden="true" className="text-primary-text">→</span>
        </Link>
        <Link href="/feedback" className="flex min-h-20 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-8">
          <span className="text-[length:var(--type-lead)] font-[var(--weight-bold)] text-ink">建议反馈</span>
          <span aria-hidden="true" className="text-primary-text">→</span>
        </Link>
      </LhPanel>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/auth/tools" className="inline-flex min-h-11 items-center rounded-[var(--lh-control-radius)] px-3 text-[length:var(--type-control)] font-[var(--weight-bold)] text-primary-text transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">工具授权</Link>
        <form action="/api/auth/logout" method="post">
          <input type="hidden" name="csrfToken" value={principal.csrfToken ?? ""} />
          <LhButton type="submit">退出登录</LhButton>
        </form>
      </div>
    </div>
  );
}
