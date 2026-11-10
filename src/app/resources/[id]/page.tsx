import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireSiteVisitor } from "@/modules/auth/access";
import { ResourceView } from "@/components/knowledge/ResourceView";
import { getSiteKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { HubError } from "@/modules/knowledge-hub/service";
export const dynamic = "force-dynamic";
export default async function ResourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string; returnTo?: string; returnAnchor?: string }> }) {
  if (!isKnowledgeHubEnabled()) return <p>知识服务尚未启用。</p>;
  const [{ id }, { version, returnTo, returnAnchor }, principal] = await Promise.all([params, searchParams, headers().then(requireSiteVisitor)]);
  const resource = await getSiteKnowledgeHub(principal).get(id, version).catch(error => {
    if (error instanceof HubError && error.code === "not_found") notFound();
    throw error;
  });
  return <ResourceView resource={resource} returnTo={returnTo} returnAnchor={returnAnchor} />;
}
