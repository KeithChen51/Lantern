import { Prisma, type PrismaClient } from "@prisma/client";
import type { HubResource, HubStore, HubTransaction, HubVersion, Interaction, Relation } from "./types";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type ResourceRow = Prisma.HubResourceGetPayload<{ include: { versions: true } }>;
function resource(row: ResourceRow): HubResource {
  return { ...row, type: row.type as HubResource["type"], tags: row.tags as string[], createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), versions: row.versions.sort((a, b) => a.number - b.number).map(v => ({ ...v, validity: v.validity as HubVersion["validity"], createdAt: v.createdAt.toISOString(), publishedAt: v.publishedAt?.toISOString() ?? null, effectiveFrom: v.effectiveFrom?.toISOString() ?? null, effectiveTo: v.effectiveTo?.toISOString() ?? null, files: v.files as unknown as HubVersion["files"], citations: v.citations as unknown as HubVersion["citations"] })) };
}
function interaction(row: Prisma.HubInteractionGetPayload<object>): Interaction {
  return { ...row, scope: row.scope as Interaction["scope"], consentAt: row.consentAt.toISOString(), receivedAt: row.receivedAt.toISOString(), messages: row.messages as unknown as Interaction["messages"], resourceVersions: row.resourceVersions as string[] };
}
function transaction(client: Prisma.TransactionClient): HubTransaction {
  return {
    async getResource(id) { const row = await client.hubResource.findUnique({ where: { id }, include: { versions: true } }); return row ? resource(row) : null; },
    async listResources() {
      const rows = await client.hubResource.findMany({ include: { versions: { omit: { files: true } } } });
      return rows.map(row => resource({ ...row, versions: row.versions.map(version => ({ ...version, files: [] })) }));
    },
    async saveResource(value) {
      const { versions, ...data } = value;
      const row = { ...data, tags: json(data.tags), createdAt: new Date(data.createdAt), updatedAt: new Date(data.updatedAt) };
      await client.hubResource.upsert({ where: { id: value.id }, create: row, update: row });
      for (const v of versions) {
        const version = { ...v, resourceId: value.id, createdAt: new Date(v.createdAt), publishedAt: v.publishedAt ? new Date(v.publishedAt) : null, effectiveFrom: v.effectiveFrom ? new Date(v.effectiveFrom) : null, effectiveTo: v.effectiveTo ? new Date(v.effectiveTo) : null, files: json(v.files), citations: json(v.citations) };
        // Once stored, version content is immutable. Publication is the only update.
        await client.hubVersion.upsert({ where: { id: v.id }, create: version, update: { publishedAt: version.publishedAt } });
      }
    },
    async getInteraction(id) { const row = await client.hubInteraction.findUnique({ where: { id } }); return row ? interaction(row) : null; },
    async findInteraction(source, externalId) { const row = await client.hubInteraction.findUnique({ where: { source_externalId: { source, externalId } } }); return row ? interaction(row) : null; },
    async saveInteraction(value) { await client.hubInteraction.create({ data: { ...value, consentAt: new Date(value.consentAt), receivedAt: new Date(value.receivedAt), messages: json(value.messages), resourceVersions: json(value.resourceVersions) } }); },
    async saveRelation(value) { await client.hubRelation.upsert({ where: { id: value.id }, create: value, update: {} }); },
    async relations(versionId) { return await client.hubRelation.findMany({ where: { fromVersionId: versionId } }) as Relation[]; },
    async provenance(versionId) { return (await client.hubProvenance.findMany({ where: { versionId } })).map(row => ({ ...row, messageIds: row.messageIds as string[] })); },
    async saveProvenance(value) { await client.hubProvenance.upsert({ where: { versionId_interactionId: { versionId: value.versionId, interactionId: value.interactionId } }, create: { ...value, messageIds: json(value.messageIds) }, update: { messageIds: json(value.messageIds) } }); },
    async audit(value) { await client.hubAudit.create({ data: { ...value, createdAt: new Date(value.createdAt) } }); },
  };
}
export class PrismaHubStore implements HubStore {
  constructor(private readonly client: PrismaClient) {}
  async transaction<T>(fn: (tx: HubTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client.$transaction(tx => fn(transaction(tx)), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
      } catch (error) {
        if (attempt >= 3 || !(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2034", "P2002"].includes(error.code)) throw error;
      }
    }
  }
}
