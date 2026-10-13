#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LighthouseClient } from './client.js';
import { SecureStore, MemoryStore, FileLock, atomicWrite, privateDirectory, defaultDirectory } from './credentials.js';
import { ClientError, validateOrigin } from './transport.js';
import { serveMcp } from './mcp.js';

const HELP = `lighthouse --server https://knowledge.example auth login [--open] [--device-name NAME]
lighthouse [--server ORIGIN] auth status|logout
lighthouse [--server ORIGIN] knowledge browse|search|get|outline|read|files|download [options]
lighthouse [--server ORIGIN] mcp serve
Knowledge options: --resource-id ID --version-id VERSION --file-id FILE --query TEXT --type TYPE
  --tag TAG --visibility VISIBILITY --folder-id FOLDER --offset NUMBER --limit NUMBER
  --section-offset NUMBER --section-limit NUMBER --file-offset NUMBER --file-limit NUMBER
  --start-line NUMBER --line-count NUMBER --path FILE_PATH --output FILE
--ephemeral uses only this process's memory; credentials are never persisted.
An ephemeral login authenticates this process only. Use the exported API for a session that
logs in and retrieves knowledge in one process. MCP/CLI normally share the OS credential store.
`;
export function parseArguments(argv) {
  const args = {}; const words = [];
  const boolean = new Set(['open', 'ephemeral', 'help']);
  const allowed = new Set(['server', 'open', 'ephemeral', 'help', 'device-name', 'resource-id', 'version-id', 'file-id', 'query', 'type', 'tag', 'visibility', 'folder-id', 'section-offset', 'section-limit', 'file-offset', 'file-limit', 'start-line', 'line-count', 'path', 'limit', 'offset', 'output']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { words.push(arg); continue; }
    const name = arg.slice(2);
    if (!allowed.has(name) || name in args) throw new ClientError('invalid_arguments');
    if (boolean.has(name)) args[name] = true;
    else { if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new ClientError('invalid_arguments'); args[name] = argv[++i]; }
  }
  if (words.length > 2) throw new ClientError('invalid_arguments');
  return { words, args };
}
export async function runCli(argv, { stdout = process.stdout, stderr = process.stderr, directory = defaultDirectory(), createClient = (origin, options) => new LighthouseClient(origin, options), serve = serveMcp } = {}) {
  const { words, args } = parseArguments(argv);
  if (args.help || words.length === 0) { stderr.write(HELP); return; }
  const [group, operation] = words;
  if (!(group === 'auth' && ['login', 'status', 'logout'].includes(operation) || group === 'knowledge' && ['browse', 'search', 'get', 'outline', 'read', 'files', 'download'].includes(operation) || group === 'mcp' && operation === 'serve')) throw new ClientError('unknown_command');
  let server = args.server;
  if (!server) { try { const profile = JSON.parse(await readFile(join(directory, 'profile.json'), 'utf8')); server = profile.server; } catch { throw new ClientError('server_required', 'Use --server with an HTTPS origin.'); } }
  server = validateOrigin(server);
  const client = createClient(server, { store: args.ephemeral ? new MemoryStore() : new SecureStore({ directory }), lock: new FileLock({ directory }) });
  let result;
  if (group === 'auth') {
    const extras = Object.keys(args).filter(key => !['server', 'ephemeral', ...(operation === 'login' ? ['open', 'device-name'] : [])].includes(key));
    if (extras.length) throw new ClientError('invalid_arguments');
    if (operation === 'login') {
      result = await client.login({ deviceName: args['device-name'], openBrowser: args.open, onVerification: info => stderr.write(`Open ${info.verificationUri}\nCode: ${info.userCode}\n`) });
      if (!args.ephemeral) { await privateDirectory(directory); await atomicWrite(join(directory, 'profile.json'), JSON.stringify({ server })); }
    } else result = await client[operation]();
  } else if (group === 'mcp') {
    if (Object.keys(args).some(key => !['server', 'ephemeral'].includes(key))) throw new ClientError('invalid_arguments');
    await serve(client); return;
  } else {
    if (Object.keys(args).some(key => ['open', 'device-name'].includes(key))) throw new ClientError('invalid_arguments');
    const options = {};
    for (const [key, value] of Object.entries(args)) {
      if (['server', 'ephemeral', 'output'].includes(key)) continue;
      const mapped = key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[mapped] = ['limit', 'offset', 'section-offset', 'section-limit', 'file-offset', 'file-limit', 'start-line', 'line-count'].includes(key) ? Number(value) : value;
    }
    if (operation === 'download') { if (!args.output) throw new ClientError('output_required'); result = await client.download(options, args.output); }
    else { if (args.output) throw new ClientError('invalid_arguments'); result = await client.knowledge(operation, options); }
  }
  stdout.write(`${JSON.stringify(result)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch(error => { process.stderr.write(`${JSON.stringify({ error: error instanceof ClientError ? error.code : 'client_error', message: error instanceof ClientError ? error.message : 'Client operation failed.' })}\n`); process.exitCode = 1; });
}
