import { ActionCaseDetailPage } from "../ActionCaseDetailPage";

export default async function ActionCaseSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ActionCaseDetailPage slug={slug} />;
}
