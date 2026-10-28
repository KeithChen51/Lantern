import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => (() => void) | void>,
  refs: [] as Array<{ current: unknown }>,
  push: vi.fn(),
}));

vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [initial, vi.fn()],
  useRef: (initial: unknown) => {
    const ref = { current: initial };
    harness.refs.push(ref);
    return ref;
  },
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => (() => void) | void) => { harness.effects.push(effect); },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/mirror", useRouter: () => ({ push: harness.push }) }));
vi.mock("@/hooks/use-lighthouse-motion", () => ({ useLhScrollProgress: vi.fn() }));
import { Navigation } from "./Navigation";

function elements(node: ReactNode): Array<ReactElement<Record<string, unknown>>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children as ReactNode)];
}

function renderSearch() {
  const view = Navigation({ isPinned: true, onTogglePin: vi.fn(), isMobileOpen: false, onMobileClose: vi.fn() });
  const search = elements(view).find(element => typeof element.type === "function" && element.type.name === "SidebarSearch")!;
  const searchView = (search.type as (props: unknown) => ReactNode)(search.props);
  const panel = elements(searchView).find(element => typeof element.type === "function" && element.type.name === "SidebarSearchPanel")!;
  const panelView = (panel.type as (props: unknown) => ReactNode)(panel.props);
  return {
    input: elements(panelView).find(element => element.type === "input")!.props,
    form: elements(panelView).find(element => element.type === "form")!.props,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  harness.effects = [];
  harness.refs = [];
});

describe("sidebar search composition", () => {
  it.each([{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }])("does not navigate on an IME confirmation Enter (%o)", nativeEvent => {
    const { input } = renderSearch();
    const preventDefault = vi.fn();
    (input.onKeyDown as (event: unknown) => void)({ key: "Enter", nativeEvent, preventDefault, currentTarget: { value: "kehu" } });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(harness.push).not.toHaveBeenCalled();
  });

  it("blocks native form submission while composition is active and allows a later deliberate Enter", () => {
    const { input, form } = renderSearch();
    (input.onCompositionStart as () => void)();
    (form.onSubmit as (event: unknown) => void)({ preventDefault: vi.fn() });
    expect(harness.push).not.toHaveBeenCalled();
    (input.onCompositionEnd as () => void)();
    (input.onKeyDown as (event: unknown) => void)({ key: "Enter", nativeEvent: { isComposing: false, keyCode: 13 }, preventDefault: vi.fn(), currentTarget: { value: " 客户 " } });
    expect(harness.push).toHaveBeenCalledExactlyOnceWith("/search?q=%E5%AE%A2%E6%88%B7");
  });
});

describe("mobile navigation modal lifecycle", () => {
  function fixture(desktop = false) {
    class Element { isConnected = true; focus = vi.fn(); }
    const opener = new Element();
    const close = new Element();
    const dialog = { showModal: vi.fn(), close: vi.fn() };
    const media = { matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const document = { activeElement: opener, body: { style: { overflow: "auto" } } };
    vi.stubGlobal("HTMLElement", Element);
    vi.stubGlobal("document", document);
    vi.stubGlobal("window", { matchMedia: vi.fn(() => media) });
    const onClose = vi.fn();
    const refOffset = harness.refs.length;
    const view = Navigation({ isPinned: false, onTogglePin: vi.fn(), isMobileOpen: true, onMobileClose: onClose });
    harness.refs[refOffset + 1].current = dialog;
    harness.refs[refOffset + 2].current = close;
    return { view, dialog, opener, close, media, document, onClose, effect: harness.effects.at(-1)! };
  }

  it("opens as a browser modal, focuses its close control, and restores scrolling and opener focus on close", () => {
    const fixtureValue = fixture();
    const cleanup = fixtureValue.effect();
    expect(fixtureValue.dialog.showModal).toHaveBeenCalledOnce();
    expect(fixtureValue.close.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(fixtureValue.document.body.style.overflow).toBe("hidden");
    expect(fixtureValue.media.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    cleanup?.();
    expect(fixtureValue.dialog.close).toHaveBeenCalledOnce();
    expect(fixtureValue.document.body.style.overflow).toBe("auto");
    expect(fixtureValue.opener.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(fixtureValue.media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("uses a closed native dialog in server markup and maps Escape to the controlled close action", () => {
    const { view, onClose } = fixture();
    const dialog = elements(view).find(element => element.type === "dialog")!;
    expect(dialog.props.open).toBeUndefined();
    const preventDefault = vi.fn();
    (dialog.props.onCancel as (event: unknown) => void)({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("wraps keyboard focus at both ends and closes only on a backdrop click", () => {
    const { view, document, onClose } = fixture();
    const dialog = elements(view).find(element => element.type === "dialog")!;
    const first = { focus: vi.fn(), getClientRects: () => [true] };
    const last = { focus: vi.fn(), getClientRects: () => [true] };
    const currentTarget = { querySelectorAll: () => [first, last] };
    const preventDefault = vi.fn();
    Object.assign(document, { activeElement: last });
    (dialog.props.onKeyDown as (event: unknown) => void)({ key: "Tab", shiftKey: false, currentTarget, preventDefault });
    expect(first.focus).toHaveBeenCalledOnce();
    Object.assign(document, { activeElement: first });
    (dialog.props.onKeyDown as (event: unknown) => void)({ key: "Tab", shiftKey: true, currentTarget, preventDefault });
    expect(last.focus).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledTimes(2);
    (dialog.props.onClick as (event: unknown) => void)({ target: first, currentTarget });
    expect(onClose).not.toHaveBeenCalled();
    (dialog.props.onClick as (event: unknown) => void)({ target: currentTarget, currentTarget });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when resized to desktop instead of leaving an invisible blocking modal", () => {
    const { effect, media, onClose } = fixture();
    const cleanup = effect();
    const onChange = media.addEventListener.mock.calls[0][1];
    onChange({ matches: true });
    expect(onClose).toHaveBeenCalledOnce();
    cleanup?.();
    const alreadyDesktop = fixture(true);
    alreadyDesktop.effect();
    expect(alreadyDesktop.dialog.showModal).not.toHaveBeenCalled();
    expect(alreadyDesktop.onClose).toHaveBeenCalledOnce();
  });
});
