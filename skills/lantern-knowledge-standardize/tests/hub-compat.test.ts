import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { validate } from "../scripts/validate.mjs";
const require = createRequire(import.meta.url);
const { importSchema, KnowledgeHub } = require("../../../src/modules/knowledge-hub/service") as typeof import("../../../src/modules/knowledge-hub/service");
const { resourceTypes } = require("../../../src/modules/knowledge-hub/types") as typeof import("../../../src/modules/knowledge-hub/types");
const { MemoryHubStore } = require("../../../src/modules/knowledge-hub/test-store") as typeof import("../../../src/modules/knowledge-hub/test-store");

describe("standardization skill to Hub import", () => {
  for (const type of resourceTypes) {
    it(`imports ${type} export as a draft without frontmatter`, async () => {
      const text = await readFile(new URL(`../assets/${type}.md`, import.meta.url), "utf8");
      const checked = await validate(text, { id: `standardize-${type}` });
      assert.equal(checked.ready, true);
      const request = importSchema.parse(checked.request);
      assert.ok(!request.markdown.includes("schemaVersion:"));
      const hub = new KnowledgeHub(new MemoryHubStore());
      const imported = await hub.import(request);
      assert.equal(imported.published, false);
      assert.equal((await hub.import(request)).duplicate, true);
      const preview = await hub.get(imported.resourceId, imported.versionId, true);
      assert.equal(preview.type, type);
      assert.equal(preview.version.markdown, request.markdown);
    });
  }
});
