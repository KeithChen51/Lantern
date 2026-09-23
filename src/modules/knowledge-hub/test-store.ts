import type { HubAudit, HubResource, HubStore, HubTransaction, Interaction, Provenance, Relation } from "./types";

// Test-only transactional repository. Production always uses MySQL.
export class MemoryHubStore implements HubStore {
  resources = new Map<string, HubResource>();
  interactions = new Map<string, Interaction>();
  links = new Map<string, Relation>();
  provenance: Provenance[] = [];
  audits: HubAudit[] = [];
  private pending = Promise.resolve();
  async transaction<T>(fn: (tx: HubTransaction) => Promise<T>): Promise<T> {
    const before = this.pending;
    let release!: () => void;
    this.pending = new Promise<void>(resolve => { release = resolve; });
    await before;
    const resources = structuredClone(this.resources), interactions = structuredClone(this.interactions), links = structuredClone(this.links), provenance = structuredClone(this.provenance), audits = structuredClone(this.audits);
    try {
      const result = await fn({
        getResource: async id => resources.get(id) ?? null,
        listResources: async () => [...resources.values()],
        saveResource: async value => { resources.set(value.id, value); },
        getInteraction: async id => interactions.get(id) ?? null,
        findInteraction: async (source, externalId) => [...interactions.values()].find(i => i.source === source && i.externalId === externalId) ?? null,
        saveInteraction: async value => { interactions.set(value.id, value); },
        saveRelation: async value => { links.set(value.id, value); },
        relations: async id => [...links.values()].filter(l => l.fromVersionId === id),
        provenance: async id => provenance.filter(p => p.versionId === id),
        saveProvenance: async value => { const index = provenance.findIndex(p => p.versionId === value.versionId && p.interactionId === value.interactionId); if (index === -1) provenance.push(value); else provenance[index] = value; },
        audit: async value => { audits.push(value); },
      });
      this.resources = resources; this.interactions = interactions; this.links = links; this.provenance = provenance; this.audits = audits;
      return structuredClone(result);
    } finally { release(); }
  }
}
