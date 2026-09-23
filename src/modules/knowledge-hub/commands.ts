import { z } from "zod";
import { importSchema, interactionSchema, searchSchema, type KnowledgeHub } from "./service";

export const commands = {
  search: { description: "Search published Lantern resources. Sort by relevance, published or updated. Returns versioned citations, not generated answers.", schema: searchSchema },
  get: { description: "Read a resource and its exact published version, citations and package files.", schema: z.object({ id: z.string().min(1), versionId: z.string().optional() }) },
  preview: { description: "Local maintenance: preview a specific draft or archived version before publishing.", schema: z.object({ id: z.string().min(1), versionId: z.string().min(1) }) },
  history: { description: "Local maintenance: list immutable resource versions, including drafts.", schema: z.object({ id: z.string().min(1) }) },
  import: { description: "Import Markdown as a draft. Reuse a stable resource id for updates. Does not publish. File contents use base64 and relative package paths.", schema: importSchema },
  publish: { description: "Explicitly publish a prepared version. It becomes available to Lantern pages and search.", schema: z.object({ id: z.string().min(1), versionId: z.string().min(1) }) },
  archive: { description: "Archive a resource, removing it from public reads and search without deleting its history.", schema: z.object({ id: z.string().min(1) }) },
  relate: { description: "Record an explicit relationship between two exact versions.", schema: z.object({ fromVersionId: z.string(), toVersionId: z.string(), kind: z.enum(["based_on", "supersedes", "related", "companion"]) }) },
  receive_interaction: { description: "Return a conversation ONLY after the user explicitly agrees to the specified content scope and purpose. No answer means no consent. This stores runtime data, not searchable knowledge.", schema: interactionSchema },
  read_interaction: { description: "Local maintenance: read an interaction for curation. Never automatically publish its contents.", schema: z.object({ id: z.string().min(1) }) },
  attach_provenance: { description: "Attach selected interaction messages to a resource draft as provenance. Does not publish or copy conversations automatically.", schema: z.object({ versionId: z.string(), interactionId: z.string(), messageIds: z.array(z.string()).min(1) }) },
} as const;
export type Command = keyof typeof commands;
export function isCommand(value: string): value is Command { return value in commands && Object.hasOwn(commands, value); }
export async function executeCommand(hub: KnowledgeHub, command: Command, input: unknown) {
  switch (command) {
    case "search": return hub.search(commands.search.schema.parse(input));
    case "get": { const x = commands.get.schema.parse(input); return hub.get(x.id, x.versionId); }
    case "preview": { const x = commands.preview.schema.parse(input); return hub.get(x.id, x.versionId, true); }
    case "history": return hub.history(commands.history.schema.parse(input).id);
    case "import": return hub.import(input);
    case "publish": { const x = commands.publish.schema.parse(input); return hub.publish(x.id, x.versionId); }
    case "archive": return hub.archive(commands.archive.schema.parse(input).id);
    case "relate": return hub.relate(commands.relate.schema.parse(input));
    case "receive_interaction": return hub.submitInteraction(input);
    case "read_interaction": return hub.interaction(commands.read_interaction.schema.parse(input).id);
    case "attach_provenance": { const x = commands.attach_provenance.schema.parse(input); return hub.attachProvenance(x.versionId, x.interactionId, x.messageIds); }
  }
}
