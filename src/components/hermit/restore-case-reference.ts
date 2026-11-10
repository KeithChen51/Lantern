import { authFetch } from "@/components/auth/auth-fetch";
import { caseDraftReference, type CaseDraftReference } from "./case-entry";
import { isHermitResourceResponse, type HermitDocumentRecommendation } from "./types";

/** Re-check the publication through the same authorized endpoint as the reader. */
export async function restoreCaseReference(reference: CaseDraftReference, signal: AbortSignal, fetchResource: typeof authFetch = authFetch): Promise<HermitDocumentRecommendation> {
  const parsed = caseDraftReference(reference);
  if (!parsed) throw new Error("invalid-case-reference");
  signal.throwIfAborted();
  const response = await fetchResource(`/api/resources/${encodeURIComponent(parsed.resourceId)}?version=${encodeURIComponent(parsed.versionId)}`, { signal });
  signal.throwIfAborted();
  if (!response.ok) throw new Error("case-reference-unavailable");
  const payload: unknown = await response.json();
  signal.throwIfAborted();
  if (!isHermitResourceResponse(payload) || payload.id !== parsed.resourceId || payload.version.id !== parsed.versionId ||
    !("publishedAt" in payload.version) || typeof payload.version.publishedAt !== "string" || !payload.version.publishedAt) {
    throw new Error("case-reference-invalid-publication");
  }
  return { id: `context:${payload.id}`, resourceId: payload.id, versionId: payload.version.id, title: payload.title, source: payload.source };
}
