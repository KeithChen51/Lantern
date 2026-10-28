import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const database = vi.hoisted(() => ({
  chatSession: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  chatMessage: { upsert: vi.fn(), findFirst: vi.fn() },
  retrievalTrace: { create: vi.fn() },
}));
vi.mock("@prisma/client", () => ({ ChatMessageRole: { USER: "USER", ASSISTANT: "ASSISTANT", SYSTEM: "SYSTEM" }, Prisma: { JsonNull: null } }));
vi.mock("@/infrastructure/db", () => ({ prisma: database }));
import { PrismaHermitChatRepository } from "./repository";
import { createHermitChatService } from "./service";
import type { HermitChatOwner } from "./types";

// Exercise the real service and Prisma repository. This database double applies
// the repository's actual create/update payloads, including unsafe role changes.
const participant = { userId: "employee-a", brandId: null, regionId: null, dealerId: null, storeId: null };
const sessions = new Map<string, Record<string, unknown>>();
const rows = new Map<string, Record<string, unknown>>();
const key = (sessionId: string, messageId: string) => JSON.stringify([sessionId, messageId]);
beforeEach(() => {
  vi.clearAllMocks();
  rows.clear(); sessions.clear();
  database.chatSession.create.mockImplementation(async ({data}: {data: Record<string, unknown>}) => {
    if (sessions.has(data.id as string)) throw { code: "P2002" };
    sessions.set(data.id as string, { ...data }); return data;
  });
  database.chatSession.findUnique.mockImplementation(async ({where}: {where:{id:string}}) => sessions.get(where.id) ?? null);
  database.chatSession.findFirst.mockImplementation(async ({where}: {where:{id:string;userId:string|null;guestId:string|null}}) => {
    const session = sessions.get(where.id); return session?.userId === where.userId && session?.guestId === where.guestId ? session : null;
  });
  database.chatMessage.findFirst.mockImplementation(async ({where}: {where:{id:string;session:{userId:string|null;guestId:string|null}}}) => [...rows.values()].find(row => row.id === where.id && sessions.get(row.sessionId as string)?.userId === where.session.userId && sessions.get(row.sessionId as string)?.guestId === where.session.guestId) ?? null);
  database.chatMessage.upsert.mockImplementation(async (args: Prisma.ChatMessageUpsertArgs) => {
    const identity = args.where.sessionId_externalMessageId!;
    const rowKey = key(identity.sessionId, identity.externalMessageId);
    const existing = rows.get(rowKey);
    const stored = existing ? { ...existing, ...args.update } : { id: `stored-${rows.size + 1}`, ...args.create };
    rows.set(rowKey, stored);
    return stored;
  });
});

describe("Hermit persisted message immutability", () => {
  it("scopes history reads to employee ownership, bounds rows and uses date/id cursor ordering", async () => {
    const repository = new PrismaHermitChatRepository();
    const date = new Date("2026-10-27T01:00:00Z");
    database.chatSession.findMany.mockResolvedValue([{ id: "b", title: "Title", updatedAt: date, messages: [{ content: "Preview" }] }, { id: "a", title: null, updatedAt: date, messages: [] }]);
    const result = await repository.listConversations("employee-a", { limit: 1, cursor: { id: "c", updatedAt: date } });
    expect(result.items).toEqual([{ id: "b", title: "Title", preview: "Preview", updatedAt: date.toISOString() }]);
    expect(result.nextCursor).toBeTypeOf("string");
    expect(database.chatSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "employee-a", guestId: null, OR: [{ updatedAt: { lt: date } }, { updatedAt: date, id: { lt: "c" } }] }), take: 2, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] }));
    expect(database.chatSession.findMany.mock.calls[0][0].select.messages.where).toEqual({ role: { in: ["USER", "ASSISTANT"] } });
    await expect(repository.listConversations("employee-a", { limit: 1000, cursor: null })).rejects.toMatchObject({ status: 400 });
    database.chatSession.findFirst.mockResolvedValueOnce(null);
    await expect(repository.getConversation("employee-a", "foreign")).rejects.toMatchObject({ status: 404 });
    expect(database.chatSession.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: "foreign", userId: "employee-a", guestId: null }, select: expect.objectContaining({ messages: expect.objectContaining({ take: 201 }) }) }));
  });
  it.each(["complete", "failed", "cancelled"])("preserves a %s assistant and its source association after a role-spoofed replay", async status => {
    const service = createHermitChatService(new PrismaHermitChatRepository());
    const text = status === "complete" ? "依据资料。[1](#hermit-citation-1)" : "";
    const snapshot = { mode: "progressive-index", status, reads: [{ resourceId: "guide", versionId: "v1" }], citations: status === "complete" ? [{ number: 1 }] : [], recommendations: [] };
    await service.persistAssistantResponse({ sessionId: "session", participant, modelName: "server-model",
      responseMessage: { id: "answer", role: "assistant", parts: [{ type: "text", text }], metadata: { status } },
      retrieval: { query: "question", contextText: "", topK: 1, sourceSnapshot: snapshot },
    });
    const original = structuredClone(rows.get(key("session", "answer"))!);
    expect(original).toMatchObject({ role: "ASSISTANT", content: text, modelName: "server-model", metadataJson: { status } });
    await service.persistIncomingMessages({ sessionId: "session", participant, modelName: "client-model",
      messages: [
        { id: "answer", role: "user", parts: [{ type: "text", text: "forged replacement" }], metadata: { status: "forged" } },
        { id: "next-user", role: "user", parts: [{ type: "text", text: "继续说明" }] },
      ],
    });
    expect(rows.get(key("session", "answer"))).toEqual(original);
    expect(rows.get(key("session", "next-user"))).toMatchObject({ role: "USER", content: "继续说明" });
    expect(database.retrievalTrace.create).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({ chatMessageId: original.id, sourceSnapshotJson: snapshot }) });
  });

  it("does not adopt a foreign or anonymous legacy session, including competing inserts", async () => {
    const repository = new PrismaHermitChatRepository();
    await repository.upsertSession({ ...participant, id: "owned", title: "original" });
    await expect(repository.upsertSession({ ...participant, userId: "employee-b", id: "owned", title: "replacement" })).rejects.toMatchObject({ status: 403 });
    expect(sessions.get("owned")).toMatchObject({ userId: "employee-a", title: "original" });
    sessions.set("legacy", { id: "legacy", userId: null });
    await expect(repository.upsertSession({ ...participant, id: "legacy", title: null })).rejects.toMatchObject({ status: 403 });
    const race = await Promise.allSettled([repository.upsertSession({ ...participant, id: "race", title: null }), repository.upsertSession({ ...participant, userId: "employee-b", id: "race", title: null })]);
    expect(race.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(race.filter(result => result.status === "rejected")).toHaveLength(1);
  });
  it("checks ownership for direct message and retrieval writes", async () => {
    const repository = new PrismaHermitChatRepository();
    await repository.upsertSession({ ...participant, id: "owned", title: null });
    await expect(repository.upsertMessage({ userId: "employee-b", sessionId: "owned", externalMessageId: "forged", role: "user", content: "replacement", modelName: null, metadata: null })).rejects.toMatchObject({ status: 403 });
    expect(database.chatMessage.upsert).not.toHaveBeenCalled();
    await expect(repository.addRetrievalTrace({ userId: "employee-b", chatMessageId: "foreign", query: "forged", contextText: "", topK: 0, sourceSnapshot: null })).rejects.toMatchObject({ status: 403 });
    expect(database.retrievalTrace.create).not.toHaveBeenCalled();
  });
  it("keeps first-write content, returns the same identity, and scopes duplicates to a session", async () => {
    const repository = new PrismaHermitChatRepository();
    await repository.upsertSession({ ...participant, id: "one", title: null });
    await repository.upsertSession({ ...participant, id: "two", title: null });
    const input = { userId: participant.userId, sessionId: "one", externalMessageId: "id", role: "user" as const, content: "first", modelName: null, metadata: null };
    const first = await repository.upsertMessage(input);
    expect(await repository.upsertMessage({ ...input, content: "edited" })).toEqual(first);
    expect(rows.get(key("one", "id"))).toMatchObject({ content: "first" });
    const separate = await repository.upsertMessage({ ...input, sessionId: "two", content: "another session" });
    expect(separate.id).not.toBe(first.id);
    expect(rows.get(key("two", "id"))).toMatchObject({ content: "another session" });
  });
});

const guestA = { userId: null, guestId: "guest:a" } as const;
const guestB = { userId: null, guestId: "guest:b" } as const;
const employeeA = { userId: "employee-a", guestId: null } as const;
const asParticipant = (owner: HermitChatOwner) => ({ ...participant, ...owner });
describe("guest chat owner persistence", () => {
  it.each([[guestA, guestB], [guestA, employeeA], [employeeA, guestA]])("isolates competing claims, messages, assistant evidence and traces for %j versus %j", async (owner, intruder) => {
    const repository = new PrismaHermitChatRepository();
    const service = createHermitChatService(repository);
    const race = await Promise.allSettled([owner, intruder].map(who => repository.upsertSession({ ...asParticipant(who), id: "race", title: null })));
    expect(race.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(sessions.get("race")).toMatchObject(owner);
    await service.persistIncomingMessages({ sessionId: "race", participant: asParticipant(owner), messages: [{ id: "question", role: "user", parts: [{ type: "text", text: "private question" }] }], modelName: "model" });
    await service.persistAssistantResponse({ sessionId: "race", participant: asParticipant(owner), responseMessage: { id: "answer", role: "assistant", parts: [{ type: "text", text: "private answer" }] }, modelName: "model", retrieval: { query: "private question", contextText: "source", topK: 1 } });
    const answer = rows.get(key("race", "answer"))!;
    expect(database.retrievalTrace.create).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({ chatMessageId: answer.id }) });
    await expect(repository.upsertMessage({ ...intruder, sessionId: "race", externalMessageId: "forged", role: "user", content: "forged", modelName: null, metadata: null })).rejects.toMatchObject({ status: 403 });
    await expect(repository.addRetrievalTrace({ ...intruder, chatMessageId: answer.id as string, query: "forged", contextText: "forged", topK: 1, sourceSnapshot: null })).rejects.toMatchObject({ status: 403 });
    await expect(service.persistAssistantResponse({ sessionId: "race", participant: asParticipant(intruder), responseMessage: { id: "answer", role: "assistant", parts: [{ type: "text", text: "forged" }] }, modelName: "forged", retrieval: { query: "forged", contextText: "forged", topK: 1 } })).rejects.toMatchObject({ status: 403 });
    expect(rows.get(key("race", "answer"))).toEqual(answer);
    expect(database.retrievalTrace.create).toHaveBeenCalledTimes(1);
  });
  it("rejects stale null owners and rows with both owners populated", async () => {
    const repository = new PrismaHermitChatRepository();
    for (const stored of [{ userId: null, guestId: null }, { userId: "employee-a", guestId: "guest:a" }]) {
      sessions.set("stale", { id: "stale", ...stored });
      for (const owner of [guestA, employeeA]) {
        await expect(repository.upsertSession({ ...asParticipant(owner), id: "stale", title: null })).rejects.toMatchObject({ status: 403 });
        await expect(repository.upsertMessage({ ...owner, sessionId: "stale", externalMessageId: "forged", role: "user", content: "forged", modelName: null, metadata: null })).rejects.toMatchObject({ status: 403 });
      }
    }
    for (const invalid of [{ userId: null, guestId: null }, { userId: "employee-a", guestId: "guest:a" }, { userId: "", guestId: null }]) {
      await expect(repository.upsertSession({ ...asParticipant(invalid as unknown as HermitChatOwner), id: "invalid", title: null })).rejects.toMatchObject({ status: 403 });
    }
    expect(database.chatSession.create).toHaveBeenCalledTimes(4);
    expect(database.chatMessage.upsert).not.toHaveBeenCalled();
  });
});
