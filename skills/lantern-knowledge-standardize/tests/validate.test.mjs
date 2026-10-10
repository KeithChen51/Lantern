import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validate } from "../scripts/validate.mjs";

const sample = await readFile(new URL("../assets/document.md", import.meta.url), "utf8");
for (const type of ["notice", "case", "document", "skill", "tool"]) {
  test(`${type} template exports with metadata outside body`, async () => {
    const text = await readFile(new URL(`../assets/${type}.md`, import.meta.url), "utf8");
    const result = await validate(text, { id: `test-${type}` });
    assert.equal(result.ready, true, JSON.stringify(result.issues));
    assert.equal(result.request.type, type);
    assert.equal(result.request.id, `test-${type}`);
    assert.ok(!result.request.markdown.includes("schemaVersion:"));
    assert.ok(!("schemaVersion" in result.request));
  });
}
test("duplicate YAML keys and malformed YAML fail", async () => {
  for (const content of [sample.replace("schemaVersion: 1", "schemaVersion: 1\nschemaVersion: 1"), sample.replace("tags: [格式演示]", "tags: [broken")]) {
    assert.equal((await validate(content)).ready, false);
  }
});
test("invalid metadata cannot be silently dropped", async () => {
  for (const content of [sample.replace("type: document", "type: manual"), sample.replace("schemaVersion: 1", "schemaVersion: 2"), sample.replace("schemaVersion: 1", "schemaVersion: 1\npublished: true"), sample.replace(/source: .+/, "source: 待补"), sample.replace(/summary: .+/, "summary: ''"), sample.replace("tags: [格式演示]", "tags: not-an-array")]) {
    const r = await validate(content, { id: "test" });
    assert.equal(r.ready, false); assert.equal(r.request, null);
  }
});
test("date ranges compare instants and reject invalid calendar dates", async () => {
  for (const extra of ["effectiveFrom: 2026-02-30T00:00:00Z", "effectiveFrom: 2026-01-01T00:00:00Z\neffectiveTo: 2025-12-31T23:00:00Z"]) {
    assert.equal((await validate(sample.replace("schemaVersion: 1", `schemaVersion: 1\n${extra}`))).ready, false);
  }
  assert.equal((await validate(sample.replace("schemaVersion: 1", "schemaVersion: 1\neffectiveFrom: 2026-01-01T10:00:00+08:00\neffectiveTo: 2026-01-01T03:00:00Z"))).ready, true);
});
test("missing and empty type sections fail", async () => {
  assert.equal((await validate(sample.replace("## 正文", "## 其他"))).ready, false);
  assert.equal((await validate(sample.replace(/## 正文[\s\S]*?## 参考来源/, "## 正文\n\n## 参考来源"))).ready, false);
});
test("unclosed fences fail; code samples are not interpreted as links or sections", async () => {
  assert.equal((await validate(sample + "\n```js\nconst x = 1;\n")).ready, false);
  const code = "\n````md\n```js\n![local](C:/secret.png)\n[[hidden]]\n## 假章节\n```\n````\n";
  const result = await validate(sample + code);
  assert.equal(result.ready, true, JSON.stringify(result.issues));
  assert.ok(result.body.endsWith(code));
  assert.equal((await validate(sample + "\n> ```js\n> const a = 1;\n> ```\n")).ready, true);
});
test("local links, HTML, wiki links and unresolved references fail", async () => {
  for (const extra of ["![图片](./photo.png)", "[文件](file:///C:/x.md)", "[危险](javascript:alert)", "<div>正文</div>", "[[另一个文档]]", "[标题][missing]"]) {
    const result = await validate(sample + `\n${extra}\n`);
    assert.equal(result.ready, false, extra);
  }
  const r = await validate(sample + "\n[来源](https://example.org)\n");
  assert.equal(r.ready, true); assert.equal(r.linkAccessibility, "not_checked");
});
test("reader anchors use body line numbers rather than GitHub slugs", async () => {
  const initial = await validate(sample);
  const line = initial.body.split("\n").findIndex(l => l === "## 正文") + 1;
  assert.equal((await validate(sample + `\n[正文](#section-${line})\n`)).ready, true);
  assert.equal((await validate(sample + "\n[正文](#正文)\n")).ready, false);
});
test("malformed table is reported; style warnings do not block", async () => {
  const table = await validate(sample + "\n| A | B |\n| --- | --- |\n| x | y | z |\n");
  assert.ok(table.issues.some(x => x.code === "MD056")); assert.equal(table.ready, false);
  const style = await validate(sample.replace("## 正文", "#### 正文") .replace("#### 正文", "## 正文\n\n#### 小节"));
  assert.equal(style.ready, true); assert.ok(style.issues.some(x => x.code === "MD001"));
});
test("IDs are never silently renamed", async () => {
  assert.equal((await validate(sample, { id: "../bad" })).ready, false);
  assert.equal((await validate(sample.replace("schemaVersion: 1", "schemaVersion: 1\nid: existing"), { id: "other" })).ready, false);
});
test("indented code and inline code are preserved as examples", async () => {
  const example = "\n    ```not-a-fence\n    [local](./file.md)\n\n`[[not-a-link]]`\n";
  const r = await validate(sample + example);
  assert.equal(r.ready, true, JSON.stringify(r.issues));
  assert.ok(r.body.endsWith(example));
});
test("CLI reports separately, refuses overwrite, preserves input and blocks invalid exports", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "lantern-standardize-"));
  const input = path.join(dir, "input.md"), output = path.join(dir, "import.json");
  const cli = fileURLToPath(new URL("../scripts/check.mjs", import.meta.url));
  try {
    await writeFile(input, sample);
    const run = (...args) => spawnSync(process.execPath, [cli, input, ...args], { encoding: "utf8" });
    const missing = run("--export", output);
    assert.equal(missing.status, 1);
    const good = run("--id", "test", "--export", output);
    assert.equal(good.status, 0, good.stderr);
    assert.equal(JSON.parse(good.stdout).ready, true);
    assert.ok(!good.stdout.includes("schemaVersion:"));
    assert.equal(run("--id", "test", "--export", output).status, 2);
    assert.equal(await readFile(input, "utf8"), sample);
    await writeFile(input, "broken");
    assert.equal(run("--id", "test", "--export", path.join(dir, "bad.json")).status, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
