import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { commands, executeCommand, type Command } from "./commands";
import type { KnowledgeHub } from "./service";

export function createKnowledgeMcpServer(hub: KnowledgeHub) {
  const server = new McpServer({ name: "lighthouse-knowledge", version: "0.1.0" });
  for (const name of Object.keys(commands) as Command[]) {
    const command = commands[name];
    for (const prefix of ["lighthouse", "lantern"]) {
      server.registerTool(`${prefix}_${name}`, {
        description: prefix === "lantern" ? `Deprecated compatibility alias; use lighthouse_${name}. ${command.description}` : command.description,
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
  }
  for (const scheme of ["lighthouse", "lantern"]) {
    server.registerResource(scheme === "lighthouse" ? "resource-version" : "legacy-resource-version", new ResourceTemplate(`${scheme}://resources/{id}/versions/{versionId}`, { list: undefined }), { description: scheme === "lantern" ? "Deprecated compatibility URI; use lighthouse://. Read an exact published resource version." : "Read the Markdown for an exact published resource version.", mimeType: "text/markdown" }, async (uri, variables) => {
      const result = await hub.get(String(variables.id), String(variables.versionId));
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: result.version.markdown }] };
    });
  }
  return server;
}
