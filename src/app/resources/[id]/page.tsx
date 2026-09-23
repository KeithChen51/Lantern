import { notFound } from "next/navigation";
import { ResourceView } from "@/components/knowledge/ResourceView";
import { getKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { HubError } from "@/modules/knowledge-hub/service";
export const dynamic = "force-dynamic";
export default async function ResourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  if (!isKnowledgeHubEnabled()) return <p>知识服务尚未启用。</p>;
  const { id } = await params, { version } = await searchParams;
  const resource = await getKnowledgeHub().get(id, version).catch(error => {
    if (error instanceof HubError && error.code === "not_found") notFound();
    throw error;
  });
  return <ResourceView resource={resource} />;
}
