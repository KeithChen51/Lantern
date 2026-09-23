import { prisma } from "@/infrastructure/db";
import { KnowledgeHub } from "./service";
import { PrismaHubStore } from "./prisma-store";

export function getKnowledgeHub() {
  if (!process.env.DATABASE_URL) throw new Error("Knowledge hub requires DATABASE_URL and its database migrations.");
  return new KnowledgeHub(new PrismaHubStore(prisma));
}
export function isKnowledgeHubEnabled() {
  return process.env.KNOWLEDGE_HUB_ENABLED === "true";
}
