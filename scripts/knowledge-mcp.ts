import "./knowledge-env";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { prisma } from "../src/infrastructure/db";
import { getKnowledgeHub } from "../src/modules/knowledge-hub/runtime";
import { createKnowledgeMcpServer } from "../src/modules/knowledge-hub/mcp";

async function main() {
  const server = createKnowledgeMcpServer(getKnowledgeHub());
  const close = async () => { await server.close(); await prisma.$disconnect(); };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
  process.stdin.once("end", () => { void close(); });
  await server.connect(new StdioServerTransport());
}
main().catch(async error => { console.error(error instanceof Error ? error.message : "MCP startup failed"); await prisma.$disconnect(); process.exitCode = 1; });
