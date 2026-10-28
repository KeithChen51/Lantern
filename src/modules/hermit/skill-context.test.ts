import { describe, expect, it } from "vitest";
import { KnowledgeHub } from "@/modules/knowledge-hub/service";
import { GuestHubStore } from "@/modules/knowledge-hub/guest-store";
import { MemoryHubStore } from "@/modules/knowledge-hub/test-store";
import { resolveHermitSkillContext } from "./skill-context";

async function fixture() {
  const store = new MemoryHubStore();
  const clock = () => "2026-10-27T00:00:00.000Z";
  const employee = new KnowledgeHub(store, clock);
  const guest = new KnowledgeHub(new GuestHubStore(store, clock), clock);
  const create = async (id: string, options: Record<string, unknown> = {}) => {
    const imported = await employee.import({ id, type: "skill", title: "服务分析方法", source: "灯塔", visibility: "public", validity: "effective", markdown: "# Method\nOnly methods", ...options });
    if (options.publish !== false) await employee.publish(id, imported.versionId);
    return { resourceId: id, versionId: imported.versionId };
  };
  const setVisibility = async (id: string, visibility: "public" | "internal") => store.transaction(async tx => {
    const resource = (await tx.getResource(id))!;
    resource.visibility = visibility;
    await tx.saveResource(resource);
  });
  return { employee, guest, create, setVisibility };
}

describe("selected platform Skill context", () => {
  it("returns only the published version's trusted metadata", async () => {
    const { employee, create } = await fixture();
    const input = await create("method");
    expect(await resolveHermitSkillContext(employee, input)).toEqual({ ...input, title: "服务分析方法", source: "灯塔" });
    const unknown = await create("undated-method", { validity: "unknown" });
    expect(await resolveHermitSkillContext(employee, unknown)).toMatchObject(unknown);
  });

  it.each(["document", "tool", "notice", "case"])("rejects a published %s as the wrong context type", async type => {
    const { employee, create } = await fixture();
    await expect(resolveHermitSkillContext(employee, await create("wrong-type", { type }))).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("uses the guest reader to deny internal resources and internal historical versions", async () => {
    const { employee, guest, create, setVisibility } = await fixture();
    const privateSkill = await create("private", { visibility: "internal" });
    const oldInternal = await create("revised", { visibility: "internal" });
    await setVisibility("revised", "public");
    const publicVersion = await create("revised", { markdown: "# Public method" });
    await expect(resolveHermitSkillContext(guest, privateSkill)).rejects.toMatchObject({ status: 404 });
    await expect(resolveHermitSkillContext(guest, oldInternal)).rejects.toMatchObject({ status: 404 });
    expect(await resolveHermitSkillContext(guest, publicVersion)).toMatchObject(publicVersion);
    expect(await resolveHermitSkillContext(employee, privateSkill)).toMatchObject(privateSkill);
    await setVisibility("revised", "internal");
    await expect(resolveHermitSkillContext(guest, publicVersion)).rejects.toMatchObject({ status: 404 });
    await setVisibility("revised", "public");
    expect(await resolveHermitSkillContext(guest, publicVersion)).toMatchObject(publicVersion);
    await expect(resolveHermitSkillContext(guest, oldInternal)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects drafts, archived resources, missing resources and a version belonging to another resource", async () => {
    const { employee, create } = await fixture();
    const draft = await create("draft", { publish: false });
    const archived = await create("archived");
    const active = await create("active");
    await employee.archive("archived");
    for (const input of [draft, archived, { resourceId: "missing", versionId: "missing" }, { resourceId: active.resourceId, versionId: archived.versionId }]) {
      await expect(resolveHermitSkillContext(employee, input)).rejects.toMatchObject({ code: "not_found", status: 404 });
    }
  });

  it("rejects expired or scheduled explicit versions even when another version is readable", async () => {
    const { employee, create } = await fixture();
    const expired = await create("method", { effectiveTo: "2026-10-26T00:00:00.000Z" });
    const active = await create("method", { markdown: "# Active" });
    const scheduled = await create("method", { markdown: "# Future", effectiveFrom: "2027-01-01T00:00:00.000Z" });
    expect(await resolveHermitSkillContext(employee, active)).toMatchObject(active);
    for (const input of [expired, scheduled]) await expect(resolveHermitSkillContext(employee, input)).rejects.toMatchObject({ status: 404 });
  });
});
