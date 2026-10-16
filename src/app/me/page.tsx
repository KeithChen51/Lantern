import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { requireEmployee } from "@/modules/auth/access";
import { PageHeading } from "@/components/ui/PageHeading";
import { LhButton, LhPanel, LhStatusBadge } from "@/components/ui/lighthouse-primitives";

export const metadata: Metadata = { title: "我的 | 灯塔" };

export default async function MyPage() {
  const principal = await requireEmployee(await headers());

  return (
    <div data-lh-page="me" className="mx-auto w-full max-w-3xl space-y-8">
      <PageHeading title="我的" />
      <LhPanel aria-label="员工信息" className="p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="min-w-0 break-words text-[length:var(--title-section)] font-[var(--weight-bold)] text-ink">{principal.displayName}</h2>
          <LhStatusBadge tone="success">已登录</LhStatusBadge>
        </div>
        <dl className="mt-6 grid gap-5 text-[length:var(--type-body)] leading-[var(--leading-body)] sm:grid-cols-2">
          <div><dt className="text-muted">姓名</dt><dd className="mt-1 break-words text-ink">{principal.displayName}</dd></div>
          <div><dt className="text-muted">工号</dt><dd className="mt-1 break-all text-ink">{principal.account}</dd></div>
        </dl>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <Link href="/auth/tools" className="inline-flex min-h-11 items-center rounded-[var(--lh-control-radius)] px-3 text-[length:var(--type-control)] font-[var(--weight-bold)] text-primary-text transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">工具授权</Link>
          <form action="/api/auth/logout" method="post">
            <input type="hidden" name="csrfToken" value={principal.csrfToken ?? ""} />
            <LhButton type="submit">退出登录</LhButton>
          </form>
        </div>
      </LhPanel>
    </div>
  );
}
