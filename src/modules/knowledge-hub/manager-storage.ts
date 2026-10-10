import { AppError } from "@/shared/errors";

/** The file manager uses Prisma/MySQL; never let SQLite readers diverge from its writes. */
export function assertKnowledgeManagerStorage() {
  const driver = process.env.KNOWLEDGE_HUB_DRIVER || "mysql";
  if (driver !== "mysql") {
    throw new AppError("integration_error", "当前知识库使用 SQLite，仅支持知识读取及 CLI/MCP 管理；后台文件管理器需要 MySQL 知识库。", 503);
  }
}
