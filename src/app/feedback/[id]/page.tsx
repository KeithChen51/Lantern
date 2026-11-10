import type { Metadata } from "next";
import { requireFeedbackPage } from "@/modules/feedback/board-access";
import { SuggestionDetailView } from "../SuggestionDetailView";
import { EmployeeNotice } from "../board-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "建议详情 | 灯塔" };

export default async function FeedbackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  let viewer;
  try { viewer = await requireFeedbackPage(); } catch { return <EmployeeNotice />; }
  const { id } = await params;
  return <SuggestionDetailView key={`${viewer.userId}:${id}`} id={id} viewer={viewer} />;
}
