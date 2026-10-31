import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({ slot: 0, refSlot: 0, states: [] as unknown[], refs: [] as Array<{ current: unknown }>, effect: null as null | (() => (() => void)), fetch: vi.fn(), expiry: null as null | (() => void) }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.slot++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = value; }];
  },
  useRef: (initial: unknown) => { const index = harness.refSlot++; return harness.refs[index] ??= { current: initial }; },
  useEffect: (effect: () => (() => void)) => { harness.effect = effect; },
}));
vi.mock("@/components/auth/SessionContext", () => ({ useEmployeeSession: () => ({ kind: "employee", user: { id: "owner" }, expiresAt: 1900000000000 }) }));
vi.mock("@/components/auth/auth-fetch", () => ({ authFetch: (...args: unknown[]) => harness.fetch(...args) }));
import { EmployeeRankings } from "./EmployeeRankings";
const period = { startDate: "2026-10-01", endDate: "2026-10-31" };
const privateResult = { visits: { rows: [{ rank: 1, employee: "PRIVATE_EMPLOYEE", visits: 7 }], note: "" }, ai: { rows: [], note: "" } };
let page: EventTarget;
let documentEvents: EventTarget & { visibilityState: string };
let cleanup: (() => void) | undefined;
function nodes(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, type));
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [...(element.type === type ? [element as ReactElement<Record<string, unknown>>] : []), ...nodes(element.props.children, type)];
}
function render(): ReactNode {
  harness.slot = 0; harness.refSlot = 0;
  const root = EmployeeRankings({ period, canView: true }) as ReactElement<{ children: ReactElement[] }>;
  const query = root.props.children.at(-1)!;
  return (query.type as (props: unknown) => ReactNode)(query.props);
}
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" && "props" in node ? text((node as ReactElement<{ children?: ReactNode }>).props.children) : "";
}
function setPurpose() {
  const input = nodes(render(), "input")[0];
  (input.props.onChange as (event: unknown) => void)({ target: { value: "核对本月使用情况" } });
}
async function submit() {
  const form = nodes(render(), "form")[0];
  return (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} });
}
beforeEach(() => {
  vi.clearAllMocks();
  harness.states = []; harness.refs = []; harness.effect = null; harness.expiry = null;
  page = new EventTarget();
  documentEvents = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", documentEvents);
  vi.stubGlobal("window", Object.assign(page, { setTimeout: (callback: () => void) => { harness.expiry = callback; return 1; }, clearTimeout: vi.fn() }));
  harness.fetch.mockResolvedValue(Response.json(privateResult));
  render(); cleanup = harness.effect!();
});
afterEach(() => { cleanup?.(); vi.unstubAllGlobals(); });
describe("employee ranking sensitive-result lifetime", () => {
  it.each(["pagehide", "hidden", "expiry"])("clears named rows on %s", async event => {
    setPurpose(); await submit();
    expect(text(render())).toContain("PRIVATE_EMPLOYEE");
    if (event === "pagehide") page.dispatchEvent(new Event("pagehide"));
    if (event === "hidden") { documentEvents.visibilityState = "hidden"; documentEvents.dispatchEvent(new Event("visibilitychange")); }
    if (event === "expiry") harness.expiry!();
    expect(text(render())).not.toContain("PRIVATE_EMPLOYEE");
    expect(nodes(render(), "input")[0].props.value).toBe("");
  });
  it("does not restore an in-flight result after the page has been hidden", async () => {
    let finish!: (response: Response) => void;
    harness.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    setPurpose();
    const pending = submit();
    documentEvents.visibilityState = "hidden";
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    finish(Response.json(privateResult));
    await pending;
    expect(text(render())).not.toContain("PRIVATE_EMPLOYEE");
  });
});
