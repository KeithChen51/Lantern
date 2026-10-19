import { defaultVersion, HubError } from "./service";
import type { HubResource, HubStore, HubTransaction } from "./types";

/** Filter before search, citations, downloads and AI tools see any resource data. */
function guestResource(resource: HubResource | null, now: string): HubResource | null {
  if (!resource || resource.visibility !== "public" || resource.archived || !resource.publishedVersionId) return null;
  // Resolve expiry/scheduling against the complete history before hiding versions.
  // Otherwise removing an internal retired version could revive an older policy.
  const effective = defaultVersion(resource, now);
  if (!effective || effective.metadata?.visibility !== "public") return null;
  // Snapshotless legacy versions have unknown historical visibility: deny them.
  const versions = resource.versions.filter(version => version.publishedAt && version.metadata?.visibility === "public");
  // Do not resurrect an older public version after a restricted publication.
  if (!versions.some(version => version.id === resource.publishedVersionId)) return null;
  return { ...resource, versions };
}

/** Guest reads never expose interactions, drafts, private history or maintenance writes. */
export class GuestHubStore implements HubStore {
  constructor(private readonly store: HubStore, private readonly clock = () => new Date().toISOString()) {}
  transaction<T>(fn: (tx: HubTransaction) => Promise<T>): Promise<T> {
    return this.store.transaction(async tx => {
      const now = this.clock();
      const denied = async (): Promise<never> => { throw new HubError("invalid", "访客只能读取已公开发布的资料。"); };
      return fn({
        getResource: async id => guestResource(await tx.getResource(id), now),
        listResources: async () => (await tx.listResources()).map(resource => guestResource(resource, now)).filter((value): value is HubResource => value !== null),
        relations: async versionId => {
          const visible = new Set((await tx.listResources()).map(resource => guestResource(resource, now)).flatMap(resource => resource?.versions.map(version => version.id) ?? []));
          if (!visible.has(versionId)) return [];
          return (await tx.relations(versionId)).filter(relation => visible.has(relation.toVersionId));
        },
        getInteraction: denied, findInteraction: denied, provenance: denied,
        saveResource: denied, saveInteraction: denied, saveRelation: denied, saveProvenance: denied, audit: denied,
      });
    });
  }
}
