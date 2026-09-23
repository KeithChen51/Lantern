import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { resourceTypes, type HubResource, type HubStore, type HubTransaction, type HubVersion, type Citation } from "./types";

const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/);
const date = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString());
const fileSchema = z.object({
  path: z.string().min(1).max(240).refine(p => !p.startsWith("/") && !p.includes("\\") && !p.includes(":") && p.split("/").every(s => s && s !== "." && s !== ".."), "Use a relative package path"),
  mediaType: z.string().min(1).max(120),
  contentBase64: z.string().max(8_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
export const importSchema = z.object({
  id: identifier, type: z.enum(resourceTypes), title: z.string().trim().min(1).max(200),
  markdown: z.string().min(1).max(2_000_000).refine(value => !!value.trim(), "Markdown is empty"), summary: z.string().max(2000).default(""),
  tags: z.array(z.string().min(1).max(80)).max(50).default([]),
  source: z.string().trim().min(1).max(1000), businessScope: z.string().max(1000).default(""),
  changeNote: z.string().max(2000).default(""), validity: z.enum(["effective", "unknown", "expired"]).default("unknown"),
  effectiveFrom: date.nullable().default(null), effectiveTo: date.nullable().default(null),
  files: z.array(fileSchema).max(50).default([]),
  baseVersionId: identifier.optional(),
});
export const searchSchema = z.object({
  query: z.string().max(500).default(""), type: z.enum(resourceTypes).optional(),
  sort: z.enum(["relevance", "published", "updated"]).default("relevance"),
  offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(20),
  includeInactive: z.boolean().default(false),
});
export const interactionSchema = z.object({
  source: identifier, externalId: identifier, scope: z.enum(["full", "excerpt", "summary"]),
  consent: z.object({ granted: z.literal(true), at: date, purpose: z.string().trim().min(1).max(1000) }),
  messages: z.array(z.object({ id: identifier, role: z.enum(["user", "assistant", "tool"]), content: z.string().min(1).max(100_000) })).min(1).max(200),
  resourceVersions: z.array(identifier).max(100).default([]),
});
export class HubError extends Error {
  constructor(public code: "not_found" | "conflict" | "invalid", message: string) { super(message); }
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const uuid = () => randomUUID();
export function queryTerms(query: string) {
  const lower = query.toLowerCase().trim();
  const words = lower.match(/[a-z0-9_-]+|[\u3400-\u9fff]+/g) ?? [];
  return [...new Set(words.flatMap(word => /^[\u3400-\u9fff]{3,}$/.test(word) ? [word, ...Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2))] : [word]))];
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new HubError("invalid", message);
}
export function buildCitations(versionId: string, markdown: string): Citation[] {
  const lines = markdown.split("\n");
  const result: Citation[] = [];
  let heading = "正文", start = 0, fenced = false;
  const flush = (end: number) => {
    const text = lines.slice(start, end).join("\n").trim();
    if (text) result.push({ id: `${versionId}-L${start + 1}`, heading, startLine: start + 1, endLine: end, text });
    start = end;
  };
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const match = !fenced && /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) { flush(index); heading = match[2]; }
    if (index - start >= 50) flush(index);
  });
  flush(lines.length);
  return result;
}
function validity(version: HubVersion, now: string) {
  if (version.validity === "expired" || (version.effectiveTo && version.effectiveTo <= now)) return "expired";
  if (version.effectiveFrom && version.effectiveFrom > now) return "scheduled";
  return version.validity;
}
function defaultVersion(resource: HubResource, now: string, inactive = false) {
  const published = resource.versions.filter(v => v.publishedAt).sort((a, b) => b.number - a.number);
  if (inactive) return published.find(v => v.id === resource.publishedVersionId) ?? null;
  // A future publication does not prematurely replace today's policy. An expired
  // latest eligible publication must not silently resurrect an older policy.
  const eligible = published.find(v => validity(v, now) !== "scheduled");
  if (!eligible || validity(eligible, now) === "expired") return null;
  return eligible;
}
async function requireResource(tx: HubTransaction, id: string) {
  const resource = await tx.getResource(id);
  if (!resource) throw new HubError("not_found", `Resource not found: ${id}`);
  return resource;
}
async function record(tx: HubTransaction, action: string, targetId: string, detail: string, at: string) {
  await tx.audit({ id: uuid(), action, targetId, detail, createdAt: at });
}
export class KnowledgeHub {
  constructor(private readonly store: HubStore, private readonly clock = () => new Date().toISOString()) {}

  async import(input: unknown) {
    const data = importSchema.parse(input);
    check(!data.effectiveFrom || !data.effectiveTo || data.effectiveFrom < data.effectiveTo, "Invalid effective date interval");
    const paths = data.files.map(f => f.path);
    check(new Set(paths).size === paths.length, "Duplicate file path");
    check(data.files.reduce((n, f) => n + f.contentBase64.length, 0) <= 16_000_000, "Package exceeds 12 MB");
    const markdown = data.markdown.replace(/\r\n/g, "\n");
    const files = data.files.map(f => ({ ...f, checksum: hash(f.contentBase64) })).sort((a, b) => a.path.localeCompare(b.path));
    const checksum = hash(JSON.stringify({ markdown, files, validity: data.validity, from: data.effectiveFrom, to: data.effectiveTo }));
    return this.store.transaction(async tx => {
      const now = this.clock();
      const existing = await tx.getResource(data.id);
      if (existing && existing.type !== data.type) throw new HubError("conflict", "Resource type cannot be changed by import");
      const latest = existing?.versions.at(-1);
      if (data.baseVersionId && data.baseVersionId !== latest?.id) throw new HubError("conflict", "Resource changed; read the latest version before updating");
      const resource: HubResource = existing ?? { id: data.id, type: data.type, title: data.title, summary: "", tags: [], source: data.source, businessScope: "", archived: false, publishedVersionId: null, createdAt: now, updatedAt: now, versions: [] };
      const before = { title: resource.title, summary: resource.summary, tags: resource.tags, source: resource.source, businessScope: resource.businessScope };
      const after = { title: data.title, summary: data.summary, tags: data.tags, source: data.source, businessScope: data.businessScope };
      const metadataChanged = JSON.stringify(before) !== JSON.stringify(after);
      Object.assign(resource, { title: data.title, summary: data.summary, tags: data.tags, source: data.source, businessScope: data.businessScope });
      const duplicate = resource.versions.find(v => v.checksum === checksum);
      if (!duplicate) {
        const id = uuid();
        resource.versions.push({ id, number: (latest?.number ?? 0) + 1, title: data.title, markdown, checksum, changeNote: data.changeNote, createdAt: now, publishedAt: null, validity: data.validity, effectiveFrom: data.effectiveFrom, effectiveTo: data.effectiveTo, files, citations: buildCitations(id, markdown) });
      }
      if (!duplicate || metadataChanged) {
        resource.updatedAt = now;
        await tx.saveResource(resource);
        await record(tx, duplicate ? "metadata_updated" : "imported", resource.id, JSON.stringify({ before, after, changeNote: data.changeNote }), now);
      }
      const version = duplicate ?? resource.versions.at(-1)!;
      return { resourceId: resource.id, versionId: version.id, version: version.number, duplicate: !!duplicate, metadataChanged, processing: "ready" as const, published: !!version.publishedAt };
    });
  }

  async publish(resourceId: string, versionId: string) {
    return this.store.transaction(async tx => {
      const resource = await requireResource(tx, resourceId);
      const version = resource.versions.find(v => v.id === versionId);
      if (!version) throw new HubError("not_found", "Version does not belong to resource");
      const current = resource.versions.find(v => v.id === resource.publishedVersionId);
      if (current && current.number > version.number) throw new HubError("conflict", "Cannot publish an older version over a newer version");
      const now = this.clock();
      if (resource.publishedVersionId === versionId && !resource.archived) return { resourceId, versionId, publishedAt: version.publishedAt };
      version.publishedAt ??= now;
      resource.publishedVersionId = versionId; resource.archived = false; resource.updatedAt = now;
      await tx.saveResource(resource);
      await record(tx, "published", resourceId, versionId, now);
      return { resourceId, versionId, publishedAt: version.publishedAt };
    });
  }

  async archive(resourceId: string) {
    return this.store.transaction(async tx => {
      const resource = await requireResource(tx, resourceId);
      resource.archived = true; resource.updatedAt = this.clock();
      await tx.saveResource(resource);
      await record(tx, "archived", resourceId, "", resource.updatedAt);
      return { resourceId, archived: true };
    });
  }

  async get(resourceId: string, versionId?: string, maintenance = false) {
    return this.store.transaction(async tx => {
      const resource = await requireResource(tx, resourceId);
      const now = this.clock();
      const version = versionId ? resource.versions.find(v => v.id === versionId) : defaultVersion(resource, now);
      if ((!maintenance && resource.archived) || !version || (!maintenance && !version.publishedAt)) throw new HubError("not_found", "No published version available");
      const { versions: _versions, ...metadata } = resource;
      void _versions;
      const candidates = await tx.relations(version.id);
      const visible = maintenance || !candidates.length ? null : new Set((await tx.listResources()).filter(r => !r.archived).flatMap(r => r.versions.filter(v => v.publishedAt).map(v => v.id)));
      return { ...metadata, version, validity: validity(version, now), relations: candidates.filter(r => !visible || visible.has(r.toVersionId)), ...(maintenance ? { provenance: await tx.provenance(version.id) } : {}) };
    });
  }

  async history(resourceId: string) {
    return this.store.transaction(async tx => (await requireResource(tx, resourceId)).versions.map(v => ({ id: v.id, number: v.number, createdAt: v.createdAt, publishedAt: v.publishedAt, changeNote: v.changeNote, checksum: v.checksum })));
  }

  async search(input: unknown = {}) {
    const options = searchSchema.parse(input);
    return this.store.transaction(async tx => {
      const now = this.clock(), terms = queryTerms(options.query);
      const items = (await tx.listResources()).flatMap(resource => {
        if (resource.archived || (options.type && options.type !== resource.type)) return [];
        const version = defaultVersion(resource, now, options.includeInactive);
        if (!version) return [];
        const title = resource.title.toLowerCase(), body = version.markdown.toLowerCase();
        const metadata = `${resource.summary} ${resource.tags.join(" ")}`.toLowerCase();
        const score = terms.reduce((n, term) => n + (title.includes(term) ? 10 : 0) + (metadata.includes(term) ? 4 : 0) + (body.includes(term) ? 1 : 0), 0);
        if (terms.length && score === 0) return [];
        const citation = version.citations.find(c => terms.some(term => c.text.toLowerCase().includes(term))) ?? version.citations[0];
        return [{ id: resource.id, type: resource.type, title: resource.title, summary: resource.summary, source: resource.source, tags: resource.tags, versionId: version.id, version: version.number, publishedAt: version.publishedAt!, updatedAt: resource.updatedAt, validity: validity(version, now), score, excerpt: citation?.text.slice(0, 300) ?? "", citation: citation ? { id: citation.id, heading: citation.heading, startLine: citation.startLine, endLine: citation.endLine } : null }];
      });
      items.sort((a, b) => (options.sort === "relevance" ? b.score - a.score : options.sort === "published" ? b.publishedAt.localeCompare(a.publishedAt) : b.updatedAt.localeCompare(a.updatedAt)) || a.id.localeCompare(b.id));
      return { items: items.slice(options.offset, options.offset + options.limit), total: items.length, offset: options.offset, limit: options.limit };
    });
  }

  async relate(input: { fromVersionId: string; toVersionId: string; kind: "based_on" | "supersedes" | "related" | "companion" }) {
    const data = z.object({ fromVersionId: identifier, toVersionId: identifier, kind: z.enum(["based_on", "supersedes", "related", "companion"]) }).parse(input);
    check(data.fromVersionId !== data.toVersionId, "Cannot relate a version to itself");
    return this.store.transaction(async tx => {
      const versions = (await tx.listResources()).flatMap(r => r.versions.map(v => v.id));
      check(versions.includes(data.fromVersionId) && versions.includes(data.toVersionId), "Unknown relation version");
      const relation = { ...data, id: hash(JSON.stringify(data)) };
      await tx.saveRelation(relation);
      return relation;
    });
  }

  async submitInteraction(input: unknown) {
    const data = interactionSchema.parse(input);
    check(new Set(data.messages.map(m => m.id)).size === data.messages.length, "Duplicate message id");
    check(JSON.stringify(data).length < 2_000_000, "Interaction exceeds 2 MB");
    const checksum = hash(JSON.stringify({ ...data, consent: { granted: true, purpose: data.consent.purpose } }));
    return this.store.transaction(async tx => {
      check(data.consent.at <= this.clock(), "Consent cannot be in the future");
      if (data.resourceVersions.length) {
        const known = new Set((await tx.listResources()).flatMap(r => r.versions.map(v => v.id)));
        check(data.resourceVersions.every(id => known.has(id)), "Unknown referenced resource version");
      }
      const existing = await tx.findInteraction(data.source, data.externalId);
      if (existing) {
        if (existing.checksum !== checksum) throw new HubError("conflict", "Interaction key already exists with different content");
        return { id: existing.id, duplicate: true };
      }
      const interaction = { id: uuid(), source: data.source, externalId: data.externalId, checksum, scope: data.scope, consentAt: data.consent.at, purpose: data.consent.purpose, messages: data.messages, resourceVersions: data.resourceVersions, receivedAt: this.clock() };
      await tx.saveInteraction(interaction);
      await record(tx, "interaction_received", interaction.id, data.source, interaction.receivedAt);
      return { id: interaction.id, duplicate: false };
    });
  }

  async interaction(id: string) {
    return this.store.transaction(async tx => {
      const value = await tx.getInteraction(id);
      if (!value) throw new HubError("not_found", "Interaction not found");
      return value;
    });
  }

  async attachProvenance(versionId: string, interactionId: string, messageIds: string[]) {
    return this.store.transaction(async tx => {
      const resources = await tx.listResources();
      const version = resources.flatMap(r => r.versions).find(v => v.id === versionId);
      check(version && !version.publishedAt, "Provenance can only be attached to an unpublished version");
      const interaction = await tx.getInteraction(interactionId);
      check(interaction && messageIds.length && new Set(messageIds).size === messageIds.length && messageIds.every(id => interaction.messages.some(m => m.id === id)), "Unknown or duplicate source messages");
      await tx.saveProvenance({ versionId, interactionId, messageIds });
      await record(tx, "provenance_attached", versionId, interactionId, this.clock());
      return { versionId, interactionId, messageIds };
    });
  }
}
