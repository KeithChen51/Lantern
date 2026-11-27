import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ClientError, SCOPE, PUBLISH_SCOPE } from './transport.js';
import { parseVersionUri } from './client.js';

export const TOOL_NAMES = Object.freeze(['knowledge_browse', 'knowledge_search', 'knowledge_get', 'knowledge_outline', 'knowledge_read', 'knowledge_files', 'knowledge_file_read']);
export const PUBLISH_TOOL_NAMES = Object.freeze(['wecom_schedule', 'wecom_status']);
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
  if (client.scope === PUBLISH_SCOPE) return createPublicationServer(client);
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
function createPublicationServer(client) {
  const server = new McpServer({ name: 'lighthouse-publishing', version: '0.1.0' }, { instructions: 'Publishing requires a platform administrator grant. Upload the HTML and image files with lighthouse publish draft first. Before scheduling, obtain the user\'s confirmation of the exact draft, each application audience and the send time. A scheduled task is persisted by Lighthouse and returns its task ID immediately. Query that task ID for results. Reuse requestId after an uncertain response.' });
  const audience = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('all') }).strict(),
    z.object({ kind: z.literal('members'), ids: z.array(z.string().min(1).max(128)).min(1).max(1000) }).strict(),
    z.object({ kind: z.literal('departments'), ids: z.array(z.string().regex(/^[1-9][0-9]{0,15}$/)).min(1).max(100) }).strict(),
  ]);
  const publicationSchemas = {
    schedule: z.object({ draftId: id, scheduledAt: z.string().max(40), requestId: z.uuid(), targets: z.array(z.object({ channel: z.enum(['group', 'auto']), audience }).strict()).min(1).max(2) }).strict(),
    status: z.object({ taskId: id }).strict(),
  };
  for (const name of PUBLISH_TOOL_NAMES) {
    const operation = name.slice('wecom_'.length);
    server.registerTool(name, {
      description: operation === 'schedule' ? 'Schedule a previously uploaded immutable draft after the user confirms the applications, audiences and time. Returns a persistent task ID.' : 'Get each application result for a persistent Lighthouse publication task ID.',
      inputSchema: publicationSchemas[operation],
      annotations: { readOnlyHint: operation === 'status', destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async args => {
      try {
        const data = await client.publication(operation, args);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) { return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: error instanceof ClientError ? error.code : 'client_error' }) }] }; }
    });
  }
  return server;
}
export async function serveMcp(client) { const server = createMcpServer(client); await server.connect(new StdioServerTransport()); return server; }
