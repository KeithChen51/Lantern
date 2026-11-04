import type { SelectHTMLAttributes } from "react";
import { PageHeading } from "@/components/ui/PageHeading";
import { LhBackLink, LhButton, LhChip, LhLoadingGlyph, LhStateNotice, LhStatusBadge } from "@/components/ui/lighthouse-primitives";
import { SUGGESTION_CATEGORIES, SUGGESTION_STATUSES, type SuggestionStatus, type SuggestionSummary } from "@/modules/feedback/board-types";
import styles from "./board.module.css";

export const categoryLabel = (value: string) => SUGGESTION_CATEGORIES.find((item) => item.value === value)?.label ?? value;
export const statusLabel = (value: string) => SUGGESTION_STATUSES.find((item) => item.value === value)?.label ?? value;

export function BoardTime({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" })}</time>;
}

export function StatusBadge({ status }: { status: SuggestionStatus }) {
  const tone = status === "implemented" ? "success" : status === "declined" ? "neutral" : status === "pending" ? "info" : "primary";
  return <LhStatusBadge tone={tone}>{statusLabel(status)}</LhStatusBadge>;
}

export function SuggestionMeta({ item }: { item: SuggestionSummary }) {
  return <div className={styles.meta}><span>{item.author.name}</span><BoardTime value={item.createdAt} /><LhChip>{categoryLabel(item.category)}</LhChip><StatusBadge status={item.status} /></div>;
}

export function BoardSelect({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return <label className={styles.selectField}><span>{label}</span><select {...props}>{children}</select></label>;
}

export function BoardError({ message, retry }: { message: string; retry?: () => void }) {
  return <LhStateNotice tone="danger" action={retry ? <LhButton type="button" onClick={retry}>重试</LhButton> : undefined}>{message}</LhStateNotice>;
}

export function BoardLoading() {
  return <LhStateNotice icon={<LhLoadingGlyph label="加载中" />}>正在加载…</LhStateNotice>;
}

export function EmployeeNotice() {
  return <div className={styles.page}><PageHeading title="建议广场" /><LhStateNotice title="仅员工可查看与参与" action={<LhBackLink href="/me">前往我的</LhBackLink>}>请使用员工账号登录后再打开建议广场。访客模式无法查看建议和讨论。</LhStateNotice></div>;
}
