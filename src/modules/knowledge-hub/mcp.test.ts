import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { KnowledgeHub } from "./service";
import { MemoryHubStore } from "./test-store";
import { createKnowledgeMcpServer } from "./mcp";
import { executeCommand } from "./commands";

describe("MCP protocol and CLI service parity", () => {
  it("discovers tools, imports, publishes, searches and reads exact resource URI", async () => {
    const hub = new KnowledgeHub(new MemoryHubStore());
    const server = createKnowledgeMcpServer(hub);
    const client = new Client({ name: "test-agent", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map(t => t.name)).toContain("lantern_receive_interaction");
      const imported = await client.callTool({ name: "lantern_import", arguments: { id: "mcp-doc", type: "document", title: "服务规范", source: "测试", markdown: "# 客户等待\n及时告知。" } });
      expect(imported.isError).not.toBe(true);
      const payload = JSON.parse((imported.content as Array<{ text: string }>)[0].text);
      await executeCommand(hub, "publish", { id: "mcp-doc", versionId: payload.versionId });
      const result = await client.callTool({ name: "lantern_search", arguments: { query: "等待" } });
      expect(JSON.parse((result.content as Array<{ text: string }>)[0].text)).toEqual(await executeCommand(hub, "search", { query: "等待" }));
      const resource = await client.readResource({ uri: `lantern://resources/mcp-doc/versions/${payload.versionId}` });
      expect("text" in resource.contents[0] && resource.contents[0].text).toContain("及时告知");
      const error = await client.callTool({ name: "lantern_get", arguments: { id: "missing" } });
      expect(error.isError).toBe(true);
    } finally { await client.close(); await server.close(); }
  });
});
