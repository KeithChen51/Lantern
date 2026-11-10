import { notFound } from "next/navigation";
import { ActionCaseDetailView } from "./ActionCaseDetailView";
import { getPublicActionCaseBySlug } from "./public-action-cases";
import { ResourceView } from "@/components/knowledge/ResourceView";
import { getSiteKnowledgeHub, isKnowledgeHubEnabled } from "@/modules/knowledge-hub/runtime";
import { HubError } from "@/modules/knowledge-hub/service";
import { headers } from "next/headers";
import { requireSiteVisitor } from "@/modules/auth/access";

export async function ActionCaseDetailPage({ slug }: { slug: string }) {
  const principal = await requireSiteVisitor(await headers());
  if (isKnowledgeHubEnabled()) {
    const resource = await getSiteKnowledgeHub(principal).get(`case-${slug}`).catch(error => {
      if (error instanceof HubError && error.code === "not_found") notFound();
      throw error;
    });
    return <ResourceView resource={resource} />;
  }
  const actionCase = await getPublicActionCaseBySlug(slug, principal);

  if (!actionCase) {
    notFound();
  }

  return <ActionCaseDetailView actionCase={actionCase} />;
}
