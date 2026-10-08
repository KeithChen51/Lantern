/**
 * Black-box business acceptance for the Hermit DSH + knowledge hub path.
 *
 * This runner talks to an already running Lighthouse instance. It deliberately
 * does not mock the model, DSH, the hub, or the UI message stream. It proves
 * machine-checkable transport and provenance facts, then stores the answers for
 * a human to review for usefulness and boundary quality.
 *
 * Example:
 *   npx tsx scripts/hermit-business-acceptance.ts --base-url http://127.0.0.1:3000
 *
 * Credentials are read only from the process environment and are never placed
 * in the JSON report. The default second caller is the local knowledge CLI;
 * point HERMIT_ACCEPTANCE_CLI_ROOT at the checkout that shares the running
 * instance's DATABASE_URL when the runner is executed elsewhere.
 */
import { createHash, randomUUID } from "node:crypto";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  HERMIT_ACCEPTANCE_NO_EVIDENCE,
  HERMIT_ACCEPTANCE_SCENARIOS,
  type HermitAcceptanceScenario,
} from "./hermit-business-acceptance-fixtures";

type JsonRecord = Record<string, unknown>;
type CheckStatus = "pass" | "fail" | "blocked" | "skipped";
type OverallStatus = "pass" | "fail" | "blocked";

type Assertion = {
  name: string;
  status: CheckStatus;
  detail: string;
};

type HttpResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
  json: unknown;
  error?: string;
};

type DocumentCard = {
  id: string;
  resourceId: string;
  versionId: string;
  title: string;
  source: string;
};

type ParsedStream = {
  dataLineCount: number;
  parsedEventCount: number;
  parseErrorCount: number;
  eventTypes: string[];
  text: string;
  documentEvents: number;
  documentCards: DocumentCard[];
  malformedDocumentEvents: number;
  hasErrorEvent: boolean;
};

type ResourceMeta = {
  id: string;
  title: string;
  source: string;
  versionId: string;
  versionNumber: number | null;
  checksum: string | null;
  publishedAt: string | null;
  validity: string | null;
  markdownLength: number;
  markdownSha256: string;
};

type DocumentReadResult = {
  card: DocumentCard;
  status: OverallStatus;
  assertions: Assertion[];
  responseStatus: number;
  resource?: ResourceMeta;
};

type ChatResult = {
  status: OverallStatus;
  responseStatus: number;
  contentType: string;
  streamHeader: string;
  assertions: Assertion[];
  eventTypes: string[];
  answer: string;
  documentCards: DocumentCard[];
  parsedEventCount: number;
  rawBodyLength: number;
};

type ScenarioResult = {
  id: string;
  title: string;
  domain: string;
  question: string;
  followUpQuestion: string;
  publicKnowledgeRefs: string[];
  manualReviewPrompts: string[];
  status: OverallStatus;
  assertions: Assertion[];
  preflight: {
    search: Assertion[];
    selectedResource?: ResourceMeta;
    searchItemCount: number;
    errors: string[];
  };
  initial?: ChatResult;
  documentReads: DocumentReadResult[];
  followUp?: ChatResult;
  followUpDocumentReads: DocumentReadResult[];
};

type NoEvidenceResult = {
  id: string;
  title: string;
  query: string;
  question: string;
  manualReviewPrompts: string[];
  status: OverallStatus;
  search: Assertion[];
  chat?: ChatResult;
};

type SecondCallerResult = {
  caller: "cli" | "none";
  status: OverallStatus;
  assertions: Assertion[];
  comparisons: Array<{
    resourceId: string;
    versionId: string;
    status: CheckStatus;
    exitCode: number | null;
    metadataMatches: boolean;
    contentMatches: boolean;
    detail: string;
  }>;
};

type AcceptanceReport = {
  schemaVersion: 1;
  startedAt: string;
  finishedAt?: string;
  baseUrl: string;
  runner: {
    scenarioCount: number;
    requestTimeoutMs: number;
    secondCaller: "cli" | "none";
    cliRootConfigured: boolean;
  };
  status: OverallStatus;
  preconditions: Assertion[];
  scenarios: ScenarioResult[];
  noEvidence?: NoEvidenceResult;
  secondCaller?: SecondCallerResult;
  manualReview: {
    required: true;
    rule: string;
    answersAreEvidence: false;
    prompts: string[];
  };
  limitations: string[];
};

type RunnerConfig = {
  baseUrl: string;
  outputPath: string;
  scenarioLimit: number;
  requestTimeoutMs: number;
  secondCaller: "cli" | "none";
  cliRoot: string;
};

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_ANSWER_LENGTH = 20_000;
const MAX_SECOND_CALLER_DOCUMENTS = 12;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function assertion(name: string, status: CheckStatus, detail: string): Assertion {
  return { name, status, detail };
}

function pass(name: string, detail: string): Assertion {
  return assertion(name, "pass", detail);
}

function failOrBlocked(name: string, ok: boolean, response: HttpResult, detail: string): Assertion {
  if (ok) return pass(name, detail);
  const status: CheckStatus = response.status === 0 || response.status >= 500 ? "blocked" : "fail";
  return assertion(name, status, detail);
}

function statusFromAssertions(assertions: readonly Assertion[]): OverallStatus {
  if (assertions.some((item) => item.status === "fail")) return "fail";
  if (assertions.some((item) => item.status === "blocked")) return "blocked";
  return "pass";
}

function mergeStatus(...statuses: readonly OverallStatus[]): OverallStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("blocked")) return "blocked";
  return "pass";
}

function sanitizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("--base-url must use http or https.");
  if (parsed.username || parsed.password) throw new Error("--base-url must not contain credentials.");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function endpoint(baseUrl: string, requestPath: string): string {
  const parsed = new URL(baseUrl);
  const prefix = parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`;
  parsed.pathname = prefix;
  parsed.search = "";
  parsed.hash = "";
  return new URL(requestPath.replace(/^\/+/, ""), parsed).toString();
}

function requestHeaders(accept: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": "lantern-hermit-business-acceptance/1",
  };
  const cookie = process.env.HERMIT_ACCEPTANCE_COOKIE?.trim();
  const token = process.env.HERMIT_ACCEPTANCE_BEARER_TOKEN?.trim();
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request(
  baseUrl: string,
  requestPath: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<HttpResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint(baseUrl, requestPath), { ...init, signal: controller.signal });
    const body = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      json = undefined;
    }
    return { status: response.status, headers, body, json };
  } catch (error) {
    return {
      status: 0,
      headers: {},
      body: "",
      json: undefined,
      error: error instanceof Error ? error.message : "request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function recordString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function recordNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function resourceMeta(value: unknown): ResourceMeta | undefined {
  if (!isRecord(value)) return undefined;
  const version = value.version;
  if (!isRecord(version)) return undefined;
  const id = stringValue(value.id);
  const title = stringValue(value.title);
  const source = stringValue(value.source);
  const versionId = stringValue(version.id);
  const markdown = recordString(version.markdown);
  if (!id || !title || !source || !versionId || !markdown) return undefined;
  return {
    id,
    title,
    source,
    versionId,
    versionNumber: recordNumber(version.number),
    checksum: stringValue(version.checksum) ?? null,
    publishedAt: stringValue(version.publishedAt) ?? null,
    validity: stringValue(value.validity) ?? null,
    markdownLength: markdown.length,
    markdownSha256: sha256(markdown),
  };
}

function searchItems(value: unknown): JsonRecord[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  return value.items.filter(isRecord);
}

function streamDocumentCard(value: unknown): DocumentCard | undefined {
  if (!isRecord(value)) return undefined;
  const resourceId = stringValue(value.resourceId);
  const versionId = stringValue(value.versionId);
  const title = stringValue(value.title);
  const source = stringValue(value.source);
  if (!resourceId || !versionId || !title || !source) return undefined;
  return {
    id: stringValue(value.id) ?? `${resourceId}:${versionId}`,
    resourceId,
    versionId,
    title,
    source,
  };
}

function parseStream(body: string): ParsedStream {
  const eventTypes: string[] = [];
  const events: JsonRecord[] = [];
  let dataLineCount = 0;
  let parseErrorCount = 0;
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    const raw = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
    if (!trimmed || raw === "[DONE]") continue;
    if (!trimmed.startsWith("data:") && !raw.startsWith("{")) continue;
    if (trimmed.startsWith("data:")) dataLineCount += 1;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) events.push(parsed);
      else parseErrorCount += 1;
    } catch {
      parseErrorCount += 1;
    }
  }

  let text = "";
  let documentEvents = 0;
  let malformedDocumentEvents = 0;
  const documentCards: DocumentCard[] = [];
  let hasErrorEvent = false;
  for (const event of events) {
    const type = stringValue(event.type) ?? "";
    if (type) eventTypes.push(type);
    if (type === "text-delta") {
      const delta = stringValue(event.delta);
      if (delta) text += delta;
    }
    if (type === "error") hasErrorEvent = true;
    if (type === "data-document") {
      documentEvents += 1;
      const card = streamDocumentCard(event.data);
      if (card) documentCards.push(card);
      else malformedDocumentEvents += 1;
    }
  }
  return {
    dataLineCount,
    parsedEventCount: events.length,
    parseErrorCount,
    eventTypes: [...new Set(eventTypes)],
    text,
    documentEvents,
    documentCards,
    malformedDocumentEvents,
    hasErrorEvent,
  };
}

function chatStatusAssertions(response: HttpResult, parsed: ParsedStream, requireDocument: boolean): Assertion[] {
  const streamHeader = response.headers["x-vercel-ai-ui-message-stream"] ?? "";
  const contentType = response.headers["content-type"] ?? "";
  const assertions: Assertion[] = [
    failOrBlocked("http-200", response.status === 200, response, response.status === 0 ? `请求失败：${response.error ?? "unknown error"}` : `HTTP ${response.status}`),
    failOrBlocked("ui-message-stream-header", streamHeader === "v1", response, `x-vercel-ai-ui-message-stream=${streamHeader || "missing"}`),
    failOrBlocked("sse-data-events", parsed.dataLineCount > 0 && parsed.parsedEventCount > 0, response, `SSE data lines=${parsed.dataLineCount}, parsed events=${parsed.parsedEventCount}`),
    failOrBlocked("sse-content-type", contentType.toLowerCase().includes("text/event-stream"), response, `content-type=${contentType || "missing"}`),
    failOrBlocked("streamed-text", parsed.text.trim().length > 0, response, `answer characters=${parsed.text.length}`),
    failOrBlocked("finish-event", parsed.eventTypes.includes("finish"), response, `event types=${parsed.eventTypes.join(", ") || "none"}`),
    assertion("stream-error-event", parsed.hasErrorEvent ? "fail" : "pass", parsed.hasErrorEvent ? "stream contained an error event" : "no error event"),
    assertion("well-formed-document-events", parsed.malformedDocumentEvents ? "fail" : "pass", `document events=${parsed.documentEvents}, malformed=${parsed.malformedDocumentEvents}`),
  ];
  if (requireDocument) {
    assertions.push(assertion("document-card", parsed.documentCards.length > 0 ? "pass" : "fail", `valid document cards=${parsed.documentCards.length}`));
  }
  return assertions;
}

async function runChat(
  config: RunnerConfig,
  messages: Array<{ id: string; role: "user" | "assistant"; parts: Array<{ type: "text"; text: string }> }>,
  documentContext?: { resourceId: string; versionId: string },
  requireDocument = true,
): Promise<ChatResult> {
  const body: JsonRecord = { id: randomUUID(), messages, attachmentIds: [] };
  if (documentContext) body.documentContext = documentContext;
  const response = await request(config.baseUrl, "api/chat", {
    method: "POST",
    headers: { ...requestHeaders("text/event-stream"), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, config.requestTimeoutMs);
  const parsed = parseStream(response.body);
  const assertions = chatStatusAssertions(response, parsed, requireDocument);
  return {
    status: statusFromAssertions(assertions),
    responseStatus: response.status,
    contentType: response.headers["content-type"] ?? "",
    streamHeader: response.headers["x-vercel-ai-ui-message-stream"] ?? "",
    assertions,
    eventTypes: parsed.eventTypes,
    answer: parsed.text.slice(0, MAX_ANSWER_LENGTH),
    documentCards: parsed.documentCards,
    parsedEventCount: parsed.parsedEventCount,
    rawBodyLength: response.body.length,
  };
}

async function readDocument(config: RunnerConfig, card: DocumentCard): Promise<DocumentReadResult> {
  const response = await request(config.baseUrl, `api/resources/${encodeURIComponent(card.resourceId)}?version=${encodeURIComponent(card.versionId)}`, {
    method: "GET",
    headers: requestHeaders("application/json"),
  }, config.requestTimeoutMs);
  const meta = resourceMeta(response.json);
  const headerVersion = response.headers["x-resource-version"] ?? "";
  const assertions: Assertion[] = [
    failOrBlocked("document-http-200", response.status === 200, response, response.status === 0 ? `请求失败：${response.error ?? "unknown error"}` : `HTTP ${response.status}`),
    failOrBlocked("document-version-header", headerVersion === card.versionId, response, `X-Resource-Version=${headerVersion || "missing"}`),
    failOrBlocked("document-json-shape", !!meta, response, meta ? "resource, version and markdown are present" : "resource JSON is missing id/title/source/version/markdown"),
    failOrBlocked("document-version-identity", meta?.id === card.resourceId && meta.versionId === card.versionId, response, `read ${meta?.id ?? "?"}/${meta?.versionId ?? "?"}, expected ${card.resourceId}/${card.versionId}`),
    failOrBlocked("document-published", !!meta?.publishedAt, response, meta?.publishedAt ? `publishedAt=${meta.publishedAt}` : "version is not visibly published"),
    failOrBlocked("document-content", !!meta && meta.markdownLength > 0, response, `markdown characters=${meta?.markdownLength ?? 0}`),
  ];
  return {
    card,
    status: statusFromAssertions(assertions),
    assertions,
    responseStatus: response.status,
    ...(meta ? { resource: meta } : {}),
  };
}

async function findScenarioResource(config: RunnerConfig, scenario: HermitAcceptanceScenario): Promise<ScenarioResult["preflight"]> {
  const searchResponse = await request(config.baseUrl, `api/resources?q=${encodeURIComponent(scenario.searchQuery)}&limit=20`, {
    method: "GET",
    headers: requestHeaders("application/json"),
  }, config.requestTimeoutMs);
  const items = searchItems(searchResponse.json);
  const searchAssertions: Assertion[] = [
    failOrBlocked("hub-search-http-200", searchResponse.status === 200, searchResponse, searchResponse.status === 0 ? `请求失败：${searchResponse.error ?? "unknown error"}` : `HTTP ${searchResponse.status}`),
    failOrBlocked("hub-search-has-published-result", items.length > 0, searchResponse, `published search items=${items.length}`),
  ];
  const errors: string[] = [];
  let selected: ResourceMeta | undefined;

  const preferredItem = items.find((item) => scenario.preferredResourceIds.includes(recordString(item.id)));
  const searchCandidate = preferredItem ?? items[0];
  if (searchCandidate) {
    const id = stringValue(searchCandidate.id);
    const versionId = stringValue(searchCandidate.versionId);
    if (id && versionId) {
      const response = await request(config.baseUrl, `api/resources/${encodeURIComponent(id)}?version=${encodeURIComponent(versionId)}`, {
        method: "GET",
        headers: requestHeaders("application/json"),
      }, config.requestTimeoutMs);
      selected = resourceMeta(response.json);
      if (!selected) errors.push(`search result ${id}/${versionId} could not be read as a published resource`);
    }
  }

  if (!selected) {
    for (const id of scenario.preferredResourceIds) {
      const response = await request(config.baseUrl, `api/resources/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: requestHeaders("application/json"),
      }, config.requestTimeoutMs);
      const candidate = resourceMeta(response.json);
      if (candidate) {
        selected = candidate;
        break;
      }
      errors.push(`${id}: HTTP ${response.status || "request failed"}`);
    }
  }
  searchAssertions.push(assertion("hub-search-resource-readable", selected ? "pass" : searchResponse.status >= 500 || searchResponse.status === 0 ? "blocked" : "fail", selected ? `selected ${selected.id}/${selected.versionId}` : "no published source version could be read"));
  return { search: searchAssertions, ...(selected ? { selectedResource: selected } : {}), searchItemCount: items.length, errors };
}

async function runScenario(config: RunnerConfig, scenario: HermitAcceptanceScenario): Promise<ScenarioResult> {
  const preflight = await findScenarioResource(config, scenario);
  const assertions: Assertion[] = [...preflight.search];
  const documentReads: DocumentReadResult[] = [];
  const followUpDocumentReads: DocumentReadResult[] = [];
  if (!preflight.selectedResource) {
    return {
      id: scenario.id,
      title: scenario.title,
      domain: scenario.domain,
      question: scenario.question,
      followUpQuestion: scenario.followUpQuestion,
      publicKnowledgeRefs: [...scenario.publicKnowledgeRefs],
      manualReviewPrompts: [...scenario.manualReviewPrompts],
      status: statusFromAssertions(assertions),
      assertions,
      preflight,
      documentReads,
      followUpDocumentReads,
    };
  }

  const initialMessage = { id: randomUUID(), role: "user" as const, parts: [{ type: "text" as const, text: scenario.question }] };
  const initial = await runChat(config, [initialMessage], undefined, true);
  assertions.push(...initial.assertions);
  for (const card of initial.documentCards) documentReads.push(await readDocument(config, card));
  assertions.push(...documentReads.flatMap((item) => item.assertions));

  const selectedCard = initial.documentCards[0];
  if (!selectedCard) {
    assertions.push(assertion("follow-up-document-context", "blocked", "no verified data-document card was available for a follow-up"));
  } else {
    const followUpMessage = { id: randomUUID(), role: "user" as const, parts: [{ type: "text" as const, text: scenario.followUpQuestion }] };
    const followUp = await runChat(config, [
      initialMessage,
      { id: randomUUID(), role: "assistant" as const, parts: [{ type: "text" as const, text: initial.answer }] },
      followUpMessage,
    ], { resourceId: selectedCard.resourceId, versionId: selectedCard.versionId }, false);
    assertions.push(...followUp.assertions);
    assertions.push(assertion("follow-up-document-context", followUp.responseStatus === 200 ? "pass" : followUp.responseStatus >= 500 || followUp.responseStatus === 0 ? "blocked" : "fail", `selected ${selectedCard.resourceId}/${selectedCard.versionId}, HTTP ${followUp.responseStatus}`));
    for (const card of followUp.documentCards) followUpDocumentReads.push(await readDocument(config, card));
    assertions.push(...followUpDocumentReads.flatMap((item) => item.assertions));
    return {
      id: scenario.id,
      title: scenario.title,
      domain: scenario.domain,
      question: scenario.question,
      followUpQuestion: scenario.followUpQuestion,
      publicKnowledgeRefs: [...scenario.publicKnowledgeRefs],
      manualReviewPrompts: [...scenario.manualReviewPrompts],
      status: statusFromAssertions(assertions),
      assertions,
      preflight,
      initial,
      documentReads,
      followUp,
      followUpDocumentReads,
    };
  }

  return {
    id: scenario.id,
    title: scenario.title,
    domain: scenario.domain,
    question: scenario.question,
    followUpQuestion: scenario.followUpQuestion,
    publicKnowledgeRefs: [...scenario.publicKnowledgeRefs],
    manualReviewPrompts: [...scenario.manualReviewPrompts],
    status: statusFromAssertions(assertions),
    assertions,
    preflight,
    initial,
    documentReads,
    followUpDocumentReads,
  };
}

async function runNoEvidence(config: RunnerConfig): Promise<NoEvidenceResult> {
  const searchResponse = await request(config.baseUrl, `api/resources?q=${encodeURIComponent(HERMIT_ACCEPTANCE_NO_EVIDENCE.searchQuery)}&limit=20`, {
    method: "GET",
    headers: requestHeaders("application/json"),
  }, config.requestTimeoutMs);
  const items = searchItems(searchResponse.json);
  const searchAssertions: Assertion[] = [
    failOrBlocked("no-evidence-search-http-200", searchResponse.status === 200, searchResponse, searchResponse.status === 0 ? `请求失败：${searchResponse.error ?? "unknown error"}` : `HTTP ${searchResponse.status}`),
    failOrBlocked("no-evidence-search-empty", searchResponse.status === 200 && items.length === 0, searchResponse, `published search items=${items.length}`),
  ];
  const chat = await runChat(config, [{ id: randomUUID(), role: "user", parts: [{ type: "text", text: HERMIT_ACCEPTANCE_NO_EVIDENCE.question }] }], undefined, false);
  const boundaryAssertion = assertion("no-document-citation", chat.documentCards.length === 0 ? "pass" : "fail", `document cards=${chat.documentCards.length}`);
  const assertions = [...searchAssertions, ...chat.assertions, boundaryAssertion];
  return {
    id: HERMIT_ACCEPTANCE_NO_EVIDENCE.id,
    title: HERMIT_ACCEPTANCE_NO_EVIDENCE.title,
    query: HERMIT_ACCEPTANCE_NO_EVIDENCE.searchQuery,
    question: HERMIT_ACCEPTANCE_NO_EVIDENCE.question,
    manualReviewPrompts: [...HERMIT_ACCEPTANCE_NO_EVIDENCE.manualReviewPrompts],
    status: statusFromAssertions(assertions),
    search: searchAssertions,
    chat: { ...chat, assertions: [...chat.assertions, boundaryAssertion], status: statusFromAssertions([...chat.assertions, boundaryAssertion]) },
  };
}

type ChildResult = { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean };

function runChild(command: string, args: string[], cwd: string, timeoutMs: number): Promise<ChildResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: process.env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer | string) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      stderr += error instanceof Error ? error.message : "child process failed";
      resolve({ exitCode: null, stdout, stderr, timedOut });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}

function parseLastJson(value: string): unknown {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // CLI output may include a harmless launcher line before its JSON result.
    }
  }
  return undefined;
}

async function runCliGet(config: RunnerConfig, card: DocumentCard, expected: ResourceMeta): Promise<SecondCallerResult["comparisons"][number]> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "lantern-hermit-acceptance-"));
  const inputPath = path.join(tempRoot, "get.json");
  try {
    await writeFile(inputPath, JSON.stringify({ id: card.resourceId, versionId: card.versionId }), "utf8");
    const child = await runChild(process.execPath, ["--import", "tsx", "scripts/knowledge-hub.ts", "get", "--input", inputPath], config.cliRoot, config.requestTimeoutMs);
    const parsed = parseLastJson(child.stdout);
    const actual = resourceMeta(parsed);
    const metadataMatches = !!actual && actual.id === expected.id && actual.title === expected.title && actual.source === expected.source && actual.versionId === expected.versionId && actual.versionNumber === expected.versionNumber;
    const contentMatches = !!actual && actual.markdownSha256 === expected.markdownSha256 && actual.markdownLength === expected.markdownLength;
    const ok = child.exitCode === 0 && !child.timedOut && metadataMatches && contentMatches;
    const status: CheckStatus = ok ? "pass" : child.exitCode === null || child.timedOut || !actual ? "blocked" : "fail";
    const diagnostic = redacted((child.stderr || child.stdout).trim().slice(-300));
    return {
      resourceId: card.resourceId,
      versionId: card.versionId,
      status,
      exitCode: child.exitCode,
      metadataMatches,
      contentMatches,
      detail: ok ? "CLI get returned the same published version and Markdown content" : `CLI exit=${child.exitCode ?? "none"}, timedOut=${child.timedOut}, metadataMatches=${metadataMatches}, contentMatches=${contentMatches}${diagnostic ? `, diagnostic=${diagnostic}` : ""}`,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function runSecondCaller(config: RunnerConfig, scenarios: readonly ScenarioResult[]): Promise<SecondCallerResult> {
  if (config.secondCaller === "none") {
    return {
      caller: "none",
      status: "blocked",
      assertions: [assertion("second-caller-configured", "blocked", "second caller was disabled; published content was not compared")],
      comparisons: [],
    };
  }
  try {
    await access(path.join(config.cliRoot, "scripts", "knowledge-hub.ts"));
  } catch {
    return {
      caller: "cli",
      status: "blocked",
      assertions: [assertion("cli-script-available", "blocked", "scripts/knowledge-hub.ts is not available under HERMIT_ACCEPTANCE_CLI_ROOT")],
      comparisons: [],
    };
  }
  const unique = new Map<string, { card: DocumentCard; expected: ResourceMeta }>();
  for (const scenario of scenarios) {
    for (const read of [...scenario.documentReads, ...scenario.followUpDocumentReads]) {
      if (read.resource && read.status === "pass") unique.set(`${read.card.resourceId}/${read.card.versionId}`, { card: read.card, expected: read.resource });
    }
  }
  const selected = [...unique.values()].slice(0, MAX_SECOND_CALLER_DOCUMENTS);
  if (!selected.length) {
    return {
      caller: "cli",
      status: "blocked",
      assertions: [assertion("cli-comparison-input", "blocked", "no verified data-document version was available for CLI comparison")],
      comparisons: [],
    };
  }
  const comparisons: SecondCallerResult["comparisons"] = [];
  for (const item of selected) comparisons.push(await runCliGet(config, item.card, item.expected));
  const assertions: Assertion[] = [
    assertion("cli-script-available", "pass", `using ${selected.length} verified resource version(s)`),
    assertion("cli-content-equality", comparisons.every((item) => item.status === "pass") ? "pass" : comparisons.some((item) => item.status === "fail") ? "fail" : "blocked", `${comparisons.filter((item) => item.status === "pass").length}/${comparisons.length} CLI comparisons matched`),
  ];
  return { caller: "cli", status: statusFromAssertions(assertions), assertions, comparisons };
}

function redacted(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|rk|pk)(?:-[A-Za-z0-9]+)?-[A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_KEY]")
    .replace(/\b(?:OPENAI_API_KEY|EMBEDDING_API_KEY|HERMIT_MODEL_KEY|DATABASE_URL|HERMIT_ACCEPTANCE_BEARER_TOKEN)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/(https?:\/\/)([^\s/:@]+):([^\s/@]+)@/gi, "$1[REDACTED]@")
    .replace(/([?&](?:token|api_key|apikey|key|secret|password)=)[^&\s]+/gi, "$1[REDACTED]");
}

function reportOutput(config: RunnerConfig): string {
  return redacted(config.outputPath);
}

function makeConfig(): RunnerConfig {
  const parsed = parseArgs({
    allowPositionals: true,
    options: {
      "base-url": { type: "string" },
      output: { type: "string" },
      limit: { type: "string" },
      "request-timeout-ms": { type: "string" },
      "second-caller": { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (parsed.values.help) {
    console.log("Usage: npx tsx scripts/hermit-business-acceptance.ts --base-url <running-lantern-url> [--output <report.json>] [--limit 1-4]");
    process.exit(0);
  }
  const rawBaseUrl = stringValue(parsed.values["base-url"]) ?? process.env.HERMIT_ACCEPTANCE_BASE_URL?.trim();
  if (!rawBaseUrl) throw new Error("Set --base-url or HERMIT_ACCEPTANCE_BASE_URL.");
  const baseUrl = sanitizeBaseUrl(rawBaseUrl);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.resolve(stringValue(parsed.values.output) ?? process.env.HERMIT_ACCEPTANCE_OUTPUT?.trim() ?? path.join("output", "hermit-business-acceptance", `report-${timestamp}.json`));
  const limit = Math.min(HERMIT_ACCEPTANCE_SCENARIOS.length, numberValue(parsed.values.limit, HERMIT_ACCEPTANCE_SCENARIOS.length));
  const timeout = numberValue(parsed.values["request-timeout-ms"], DEFAULT_TIMEOUT_MS);
  const requestedCaller = stringValue(parsed.values["second-caller"]) ?? process.env.HERMIT_ACCEPTANCE_SECOND_CALLER?.trim() ?? "cli";
  if (requestedCaller !== "cli" && requestedCaller !== "none") throw new Error("--second-caller must be cli or none.");
  return {
    baseUrl,
    outputPath,
    scenarioLimit: limit,
    requestTimeoutMs: timeout,
    secondCaller: requestedCaller,
    cliRoot: path.resolve(process.env.HERMIT_ACCEPTANCE_CLI_ROOT?.trim() || process.cwd()),
  };
}

async function main() {
  const config = makeConfig();
  const startedAt = new Date().toISOString();
  const scenarios = HERMIT_ACCEPTANCE_SCENARIOS.slice(0, config.scenarioLimit);
  const report: AcceptanceReport = {
    schemaVersion: 1,
    startedAt,
    baseUrl: config.baseUrl,
    runner: {
      scenarioCount: scenarios.length,
      requestTimeoutMs: config.requestTimeoutMs,
      secondCaller: config.secondCaller,
      cliRootConfigured: !!process.env.HERMIT_ACCEPTANCE_CLI_ROOT,
    },
    status: "blocked",
    preconditions: [],
    scenarios: [],
    manualReview: {
      required: true,
      rule: "机器断言只证明传输、版本、读取和边界结构；不得把模型字符串碰巧出现当作业务质量通过。",
      answersAreEvidence: false,
      prompts: [],
    },
    limitations: [],
  };

  const probe = await request(config.baseUrl, "api/resources?q=服务&limit=1", { method: "GET", headers: requestHeaders("application/json") }, config.requestTimeoutMs);
  report.preconditions.push(failOrBlocked("running-instance-reachable", probe.status === 200, probe, probe.status === 0 ? `请求失败：${probe.error ?? "unknown error"}` : `HTTP ${probe.status}`));
  report.preconditions.push(assertion(
    "knowledge-hub-enabled",
    probe.status === 0 ? "blocked" : probe.status === 503 ? "fail" : "pass",
    probe.status === 503 ? "knowledge hub returned 503" : probe.status === 0 ? "knowledge hub could not be probed" : "knowledge hub did not return 503",
  ));

  if (statusFromAssertions(report.preconditions) !== "pass") {
    report.limitations.push("运行实例未达到知识中台 HTTP 预检条件；本次未把不可运行误报为通过。请在真实 DSH、知识中台和模型网关均可用后重跑。\n");
  } else {
    for (const scenario of scenarios) {
      const result = await runScenario(config, scenario);
      report.scenarios.push(result);
      report.manualReview.prompts.push(`${scenario.title}：${scenario.manualReviewPrompts.join("；")}`);
    }
    report.noEvidence = await runNoEvidence(config);
    report.manualReview.prompts.push(`${HERMIT_ACCEPTANCE_NO_EVIDENCE.title}：${HERMIT_ACCEPTANCE_NO_EVIDENCE.manualReviewPrompts.join("；")}`);
    report.secondCaller = await runSecondCaller(config, report.scenarios);
  }

  const statuses: OverallStatus[] = [statusFromAssertions(report.preconditions), ...report.scenarios.map((item) => item.status)];
  if (report.noEvidence) statuses.push(report.noEvidence.status);
  if (report.secondCaller) statuses.push(report.secondCaller.status);
  report.status = mergeStatus(...statuses);
  report.finishedAt = new Date().toISOString();

  await mkdir(path.dirname(config.outputPath), { recursive: true });
  await writeFile(config.outputPath, `${redacted(JSON.stringify(report, null, 2))}\n`, "utf8");
  console.log(JSON.stringify({ status: report.status, report: reportOutput(config), scenarios: report.scenarios.length, noEvidence: !!report.noEvidence, secondCaller: report.secondCaller?.status ?? "skipped" }));
  if (report.status === "fail") process.exitCode = 1;
  else if (report.status === "blocked") process.exitCode = 2;
}

void main().catch((error) => {
  console.error(redacted(error instanceof Error ? error.message : "Acceptance runner failed"));
  process.exitCode = 1;
});
