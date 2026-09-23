export const resourceTypes = ["notice", "case", "document", "skill", "tool"] as const;
export type ResourceType = (typeof resourceTypes)[number];
export type Validity = "effective" | "unknown" | "expired";
export type HubFile = { path: string; mediaType: string; contentBase64: string; checksum: string };
export type Citation = { id: string; heading: string; startLine: number; endLine: number; text: string };
export type HubVersion = {
  id: string; number: number; title: string; markdown: string; checksum: string;
  changeNote: string; createdAt: string; publishedAt: string | null;
  validity: Validity; effectiveFrom: string | null; effectiveTo: string | null;
  files: HubFile[]; citations: Citation[];
};
export type HubResource = {
  id: string; type: ResourceType; title: string; summary: string; tags: string[];
  source: string; businessScope: string; archived: boolean;
  publishedVersionId: string | null; createdAt: string; updatedAt: string;
  versions: HubVersion[];
};
export type Interaction = {
  id: string; source: string; externalId: string; checksum: string;
  scope: "full" | "excerpt" | "summary"; consentAt: string; purpose: string;
  messages: Array<{ id: string; role: "user" | "assistant" | "tool"; content: string }>;
  resourceVersions: string[]; receivedAt: string;
};
export type Relation = { id: string; fromVersionId: string; toVersionId: string; kind: "based_on" | "supersedes" | "related" | "companion" };
export type Provenance = { versionId: string; interactionId: string; messageIds: string[] };
export type HubAudit = { id: string; action: string; targetId: string; detail: string; createdAt: string };
export interface HubTransaction {
  getResource(id: string): Promise<HubResource | null>;
  listResources(): Promise<HubResource[]>;
  saveResource(resource: HubResource): Promise<void>;
  getInteraction(id: string): Promise<Interaction | null>;
  findInteraction(source: string, externalId: string): Promise<Interaction | null>;
  saveInteraction(interaction: Interaction): Promise<void>;
  saveRelation(relation: Relation): Promise<void>;
  relations(versionId: string): Promise<Relation[]>;
  saveProvenance(provenance: Provenance): Promise<void>;
  provenance(versionId: string): Promise<Provenance[]>;
  audit(event: HubAudit): Promise<void>;
}
export interface HubStore { transaction<T>(fn: (tx: HubTransaction) => Promise<T>): Promise<T> }
