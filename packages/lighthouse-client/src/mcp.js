import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ClientError, SCOPE } from './transport.js';
import { parseVersionUri } from './client.js';

export const TOOL_NAMES = Object.freeze(['knowledge_browse', 'knowledge_search', 'knowledge_get', 'knowledge_outline', 'knowledge_read', 'knowledge_files', 'knowledge_file_read']);
const id = z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9._~-]{0,119}$/);
const version = { resourceId: id, versionId: id.optional() };
const offset = z.number().int().min(0).optional();
const limit = z.number().int().min(1).max(100).optional();
const schemas = {
  browse: z.object({ folderId: id.optional(), offset, limit }).strict(), search: z.object({ query: z.string().min(1).max(500), type: z.string().max(100).optional(), tag: z.string().max(100).optional(), visibility: z.string().max(100).optional(), offset, limit }).strict(),
  get: z.object(version).strict(), outline: z.object({ ...version, sectionOffset: offset, sectionLimit: limit, fileOffset: offset, fileLimit: limit }).strict(),
  read: z.object({ ...version, offset, startLine: z.number().int().min(1).optional(), lineCount: z.number().int().min(1).max(120).optional() }).strict(),
  files: z.object({ ...version, offset, limit }).strict(), file_read: z.object({ ...version, path: z.string().min(1).max(240), offset }).strict(),
};
export function createMcpServer(client) {
  const server = new McpServer({ name: 'lighthouse', version: '0.1.0' }, { instructions: `Knowledge retrieval only. Scope ${SCOPE}. The user's Agent supplies reasoning. Preserve returned version and citation metadata.` });
  for (const name of TOOL_NAMES) {
    const operation = name.slice('knowledge_'.length);
    server.registerTool(name, { description: `Read published knowledge: ${operation}. Returns backend version and citation metadata unchanged.`, inputSchema: schemas[operation], annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async args => {
      try { const data = await client.knowledge(operation, args); return { content: [{ type: 'text', text: JSON.stringify(data) }] }; }
      catch (error) { return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: error instanceof ClientError ? error.code : 'client_error' }) }] }; }
    });
  }
  server.registerResource('knowledge-version', new ResourceTemplate('lighthouse://resources/{id}/versions/{versionId}', { list: undefined }), { description: 'Read an exact published knowledge version.', mimeType: 'application/json' }, async uri => {
    const args = parseVersionUri(uri.href);
    const data = await client.knowledge('read', args);
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data) }] };
  });
  return server;
}
export async function serveMcp(client) { const server = createMcpServer(client); await server.connect(new StdioServerTransport()); return server; }
