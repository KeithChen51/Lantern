import { notFound } from "next/navigation";
import { ActionCaseDetailView } from "./ActionCaseDetailView";
import { getPublicActionCaseBySlug } from "./public-action-cases";

export async function ActionCaseDetailPage({ slug }: { slug: string }) {
  const actionCase = await getPublicActionCaseBySlug(slug);

  if (!actionCase) {
    notFound();
  }

  return <ActionCaseDetailView actionCase={actionCase} />;
}
