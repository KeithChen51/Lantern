import type { Metadata } from "next";
import { requireFeedbackPage } from "@/modules/feedback/board-access";
import { FeedbackBoard } from "./FeedbackBoard";
import { EmployeeNotice } from "./board-ui";
import styles from "./board.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "建议广场 | 灯塔" };

export default async function FeedbackPage() {
  let viewer;
  try { viewer = await requireFeedbackPage(); } catch { return <EmployeeNotice />; }
  return <div className={styles.page} data-lh-page="feedback">
    <FeedbackBoard key={viewer.userId} viewer={viewer} />
  </div>;
}
