import type { Metadata } from "next";
import { PageHeading } from "@/components/ui/PageHeading";
import { requireFeedbackPage } from "@/modules/feedback/board-access";
import { FeedbackBoard } from "./FeedbackBoard";
import { EmployeeNotice } from "./board-ui";
import styles from "./board.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "建议反馈 | 灯塔" };

export default async function FeedbackPage() {
  let viewer;
  try { viewer = await requireFeedbackPage(); } catch { return <EmployeeNotice />; }
  return <div className={styles.page} data-lh-page="feedback">
    <PageHeading title="建议反馈" description="一起改进灯塔，记录想法、讨论与每一步回应。" />
    <FeedbackBoard viewer={viewer} />
  </div>;
}
