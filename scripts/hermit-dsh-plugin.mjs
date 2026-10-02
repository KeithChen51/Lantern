// Runs only inside the dedicated sdk-minimal profile, never the user's DSH home.
export const name = 'lantern-hermit-tools';
export const inject = ['tools', 'llm'];

export async function apply(ctx, config) {
  const { defineTool } = await import(config.toolsModule);
  const allowed = new Set(['knowledge_search', 'knowledge_read', 'attachment_read']);
  ctx.tools.guard(execution => allowed.has(execution.name) ? undefined : '路引仅允许知识读取和本次对话附件读取。');
  async function call(path, body, signal) {
    const response = await fetch(`${config.bridge}${path}`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.HERMIT_BRIDGE_TOKEN}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('路引参考资料服务暂时不可用。');
    return response.json();
  }
  for (const tool of config.tools) {
    if (!allowed.has(tool.name)) throw new Error('Unexpected Hermit tool');
    ctx.tools.register(defineTool({
      name: tool.name, description: tool.description, parameters: tool.parameters,
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(args, execution) { return JSON.stringify(await call('/tool', { name: tool.name, arguments: args }, execution.signal)); },
    }));
  }
  // The public SDK exposes durable messages, not live deltas. This profile-local
  // observer forwards only visible text, never private model reasoning.
  ctx.on('llm/stream', async function* (options, next) {
    for await (const chunk of next()) {
      if (chunk.type === 'text-delta') await call('/text', { text: chunk.text });
      yield chunk;
    }
  });
}
