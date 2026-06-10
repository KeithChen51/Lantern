import { describe, expect, it } from "vitest";
import { ActionCaseService, type ActionCaseRecord, type ActionCaseRepository, type SaveActionCaseDraftInput, parseActionCaseMarkdown } from "./action-cases";

class MemoryActionCaseRepository implements ActionCaseRepository {
  records = new Map<string, ActionCaseRecord>();
  slugToId = new Map<string, string>();
  versions = new Map<string, Array<{ id: string; versionNo: number; title: string; createdAt: Date; changeNote: string | null }>>();

  async listAdmin() {
    return [...this.records.values()];
  }

  async listPublished() {
    return [...this.records.values()].filter((record) => record.publishedVersionNo !== null && record.status !== "archived");
  }

  async findPublishedBySlug(slug: string) {
    return (await this.listPublished()).find((record) => record.slug === slug) ?? null;
  }

  async findAdminById(id: string) {
    return this.records.get(id) ?? null;
  }

  async saveDraft(input: SaveActionCaseDraftInput) {
    const existingId = input.id ?? this.slugToId.get(input.slug);
    const id = existingId ?? `case-${this.records.size + 1}`;
    const previous = this.records.get(id);
    const nextVersionNo = (previous?.currentVersionNo ?? 0) + 1;
    const record: ActionCaseRecord = {
      id,
      slug: input.slug,
      publishedSlug: previous?.publishedSlug ?? null,
      href: `/action/${input.slug}`,
      title: input.title,
      date: input.date,
      tags: input.tags,
      summary: input.summary,
      status: previous?.publishedVersionNo ? "published" : "draft",
      markdown: input.markdown,
      headings: [],
      coverImage: input.coverImage ?? null,
      currentVersionNo: nextVersionNo,
      publishedVersionNo: previous?.publishedVersionNo ?? null,
      updatedAt: new Date("2026-06-10T00:00:00Z"),
      publishedAt: previous?.publishedAt ?? null,
    };
    this.records.set(id, record);
    this.slugToId.set(input.slug, id);
    this.versions.set(id, [
      { id: `${id}-v${nextVersionNo}`, versionNo: nextVersionNo, title: input.title, createdAt: record.updatedAt, changeNote: "draft" },
      ...(this.versions.get(id) ?? []),
    ]);
    return record;
  }

  async publish(id: string) {
    const record = this.records.get(id);
    if (!record || record.currentVersionNo === null) throw new Error("not found");
    const next = {
      ...record,
      status: "published" as const,
      publishedSlug: record.slug,
      publishedVersionNo: record.currentVersionNo,
      publishedAt: new Date("2026-06-10T00:00:00Z"),
    };
    this.records.set(id, next);
    return next;
  }

  async listVersions(id: string) {
    return this.versions.get(id) ?? [];
  }
}

describe("action case markdown parsing", () => {
  it("uses frontmatter as editable import defaults", () => {
    const parsed = parseActionCaseMarkdown(
      `---
slug: driver-partner-rest-area
title: 是否为代驾司机设置合作伙伴休息区
date: 2026-06-10
tags: [客户体验, 合作伙伴, 服务边界]
status: published
---

# 文档标题

第一段摘要内容，用于列表展示。

## 现场判断

正文内容。`,
    );

    expect(parsed).toMatchObject({
      slug: "driver-partner-rest-area",
      title: "是否为代驾司机设置合作伙伴休息区",
      date: "2026-06-10",
      tags: ["客户体验", "合作伙伴", "服务边界"],
      importedStatus: "published",
    });
    expect(parsed.markdown).toContain("## 现场判断");
    expect(parsed.headings.map((heading) => heading.title)).toEqual(["文档标题", "现场判断"]);
  });

  it("falls back to the first h1 title and generated slug", () => {
    const parsed = parseActionCaseMarkdown("# 取送车交付复盘\n\n客户到店后等待超过预期。", {
      now: new Date("2026-06-10T00:00:00Z"),
    });

    expect(parsed.title).toBe("取送车交付复盘");
    expect(parsed.slug).toBe("action-case-20260610");
    expect(parsed.summary).toBe("客户到店后等待超过预期。");
  });

  it("rejects empty markdown", () => {
    expect(() => parseActionCaseMarkdown("  ")).toThrow(/required/i);
  });
});

describe("action case service", () => {
  it("updates the same slug and keeps publication manual", async () => {
    const repository = new MemoryActionCaseRepository();
    const service = new ActionCaseService(repository);

    const first = await service.saveDraft({
      slug: "driver-partner-rest-area",
      title: "是否为代驾司机设置合作伙伴休息区",
      date: "2026-06-10",
      tags: ["客户体验"],
      summary: "初稿摘要",
      markdown: "# 初稿\n\n正文",
    });
    expect(first.status).toBe("draft");
    expect(await service.listPublishedActionCases()).toEqual([]);

    const published = await service.publish(first.id);
    expect(published.status).toBe("published");
    expect(published.publishedVersionNo).toBe(1);

    const second = await service.saveDraft({
      slug: "driver-partner-rest-area",
      title: "是否为代驾司机设置合作伙伴休息区",
      date: "2026-06-11",
      tags: ["客户体验", "合作伙伴"],
      summary: "新版摘要",
      markdown: "# 新版\n\n正文",
    });

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("published");
    expect(second.currentVersionNo).toBe(2);
    expect(second.publishedVersionNo).toBe(1);
  });
});
