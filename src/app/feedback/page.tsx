import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/ui/PageHeading";
import { LhPanel } from "@/components/ui/lighthouse-primitives";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "建议反馈 | 灯塔" };

export default function FeedbackPage() {
  return <div className="mx-auto w-full max-w-3xl space-y-8">
    <PageHeading title="建议反馈" />
    <LhPanel className="space-y-4 p-5 sm:p-8">
      <h2 className="text-[length:var(--title-section)] font-[var(--weight-bold)] text-ink">反馈提交暂未开放</h2>
      <p className="text-[length:var(--type-body)] leading-[var(--leading-body)] text-muted">后续可以在这里提交使用中遇到的问题和改进建议。</p>
      <Link href="/me" className="inline-flex min-h-11 items-center rounded-[var(--lh-control-radius)] px-3 font-[var(--weight-bold)] text-primary-text hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">返回我的</Link>
    </LhPanel>
  </div>;
}
