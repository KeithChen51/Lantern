import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { commands, executeCommand, type Command } from "./commands";
import type { KnowledgeHub } from "./service";

export function createKnowledgeMcpServer(hub: KnowledgeHub) {
  const server = new McpServer({ name: "lantern-knowledge", version: "0.1.0" });
  for (const name of Object.keys(commands) as Command[]) {
    const command = commands[name];
    server.registerTool(`lantern_${name}`, {
      description: command.description,
      inputSchema: command.schema,
      annotations: { readOnlyHint: ["search", "get", "preview", "history", "read_interaction"].includes(name), destructiveHint: name === "archive", openWorldHint: false },
    }, async (input: unknown): Promise<CallToolResult> => {
      try {
        const result = await executeCommand(hub, name, input);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Operation failed" }] };
      }
    });
  }
  server.registerResource("resource-version", new ResourceTemplate("lantern://resources/{id}/versions/{versionId}", { list: undefined }), { description: "Read the Markdown for an exact published resource version.", mimeType: "text/markdown" }, async (uri, variables) => {
    const result = await hub.get(String(variables.id), String(variables.versionId));
    return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: result.version.markdown }] };
  });
  return server;
}
