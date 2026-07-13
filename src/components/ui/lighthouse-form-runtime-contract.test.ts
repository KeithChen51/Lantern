import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const globals = readFileSync(join(projectRoot, "src/app/globals.css"), "utf8");
const tempDirectory = mkdtempSync(join(tmpdir(), "lighthouse-form-contract-"));

afterAll(() => {
  rmSync(tempDirectory, { recursive: true, force: true });
});

function findBrowser() {
  const candidates = [
    process.env.LH_BROWSER_PATH,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe" : undefined,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Microsoft/Edge/Application/msedge.exe")
      : undefined,
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => {
    try {
      readFileSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
}

function readCustomProperty(name: string) {
  const match = globals.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^;]+);`));
  expect(match, `${name} must exist in globals.css`).not.toBeNull();
  return match?.[1].trim() ?? "";
}

function readCssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globals.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]+)\\}`, "m"));
  expect(match, `${selector} must have an explicit runtime rule`).not.toBeNull();
  return `${selector} {${match?.[1] ?? ""}}`;
}

function createFixture() {
  const customProperties = [
    "--type-label",
    "--type-control",
    "--type-body",
    "--type-reading",
    "--leading-label",
    "--leading-control",
    "--leading-body",
    "--leading-reading",
    "--lh-form-label-control-gap",
    "--lh-form-control-message-gap",
    "--lh-form-message-gap",
    "--lh-form-field-gap",
    "--lh-form-content-action-gap",
    "--lh-form-legend-choice-gap",
  ];
  const selectors = [
    "[data-lh-form-stack]",
    "[data-lh-field]",
    "[data-lh-field-label]",
    "[data-lh-field-optional]",
    "[data-lh-field-label] + [data-lh-field-control-shell]",
    "[data-lh-field-control-shell]",
    "[data-lh-field-control]",
    "[data-lh-field-control-shell] + [data-lh-field-messages]",
    "[data-lh-field-messages]",
    "[data-lh-field-help]",
    "[data-lh-field-error]",
    "[data-lh-field-group]",
    "[data-lh-field-legend]",
    "[data-lh-choice-group]",
    "[data-lh-form-copy]",
    "[data-lh-form-actions]",
  ];
  const css = `
    :root { ${customProperties.map((name) => `${name}: ${readCustomProperty(name)};`).join(" ")} }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-width: 0; }
    body { width: 100%; padding: 16px; }
    textarea { width: 100%; min-width: 0; }
    ${selectors.map(readCssRule).join("\n")}
  `;
  const html = `<!doctype html>
    <html><head><meta charset="utf-8"><style>${css}</style></head><body>
      <main id="viewport">
        <div data-lh-form-stack>
          <div data-lh-field id="field-one">
            <label data-lh-field-label>说明 <span data-lh-field-optional>选填</span></label>
            <div data-lh-field-control-shell><textarea data-lh-field-control>示例内容</textarea></div>
            <div data-lh-field-messages>
              <span data-lh-field-help>帮助文本</span>
              <span data-lh-field-error>错误文本</span>
            </div>
          </div>
          <fieldset data-lh-field-group id="field-two">
            <legend data-lh-field-legend>选择类型</legend>
            <div data-lh-choice-group><label><input type="radio" name="choice"> 选项</label></div>
          </fieldset>
        </div>
        <div data-lh-form-copy>持久说明正文</div>
        <div data-lh-form-actions><button>提交</button></div>
      </main>
      <pre id="result"></pre>
      <script>
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        const fieldOne = rect("#field-one");
        const fieldTwo = rect("#field-two");
        const label = rect("[data-lh-field-label]");
        const control = rect("[data-lh-field-control-shell]");
        const messages = rect("[data-lh-field-messages]");
        const help = rect("[data-lh-field-help]");
        const error = rect("[data-lh-field-error]");
        const legend = rect("[data-lh-field-legend]");
        const choices = rect("[data-lh-choice-group]");
        const copy = rect("[data-lh-form-copy]");
        const actions = rect("[data-lh-form-actions]");
        document.querySelector("#result").textContent = JSON.stringify({
          innerWidth,
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
          controlFontSize: style("[data-lh-field-control]").fontSize,
          controlLineHeight: style("[data-lh-field-control]").lineHeight,
          labelFontSize: style("[data-lh-field-label]").fontSize,
          labelLineHeight: style("[data-lh-field-label]").lineHeight,
          optionalFontSize: style("[data-lh-field-optional]").fontSize,
          optionalLineHeight: style("[data-lh-field-optional]").lineHeight,
          helpFontSize: style("[data-lh-field-help]").fontSize,
          helpLineHeight: style("[data-lh-field-help]").lineHeight,
          errorFontSize: style("[data-lh-field-error]").fontSize,
          errorLineHeight: style("[data-lh-field-error]").lineHeight,
          copyFontSize: style("[data-lh-form-copy]").fontSize,
          copyLineHeight: style("[data-lh-form-copy]").lineHeight,
          labelControlGap: control.top - label.bottom,
          controlMessageGap: messages.top - control.bottom,
          helpErrorGap: error.top - help.bottom,
          fieldGap: fieldTwo.top - fieldOne.bottom,
          legendChoiceGap: choices.top - legend.bottom,
          contentActionGap: actions.top - copy.bottom,
        });
      </script>
    </body></html>`;
  const fixturePath = join(tempDirectory, "form-contract.html");
  writeFileSync(fixturePath, html, "utf8");
  return fixturePath;
}

function runFixture(browser: string, fixturePath: string, width: number) {
  const result = spawnSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-extensions",
    `--window-size=${width},900`,
    "--dump-dom",
    `file:///${fixturePath.replace(/\\/g, "/")}`,
  ], { encoding: "utf8", timeout: 20_000 });

  expect(result.status, result.stderr).toBe(0);
  const match = result.stdout.match(/<pre id="result">([^<]+)<\/pre>/);
  expect(match, result.stdout).not.toBeNull();
  return JSON.parse(match?.[1] ?? "{}") as Record<string, string | number | boolean>;
}

describe("Lighthouse form rhythm browser contract", () => {
  const browser = findBrowser();

  it.skipIf(!browser)("keeps computed typography and spacing stable at desktop and 375px", () => {
    const fixturePath = createFixture();

    [1280, 375].forEach((width) => {
      const result = runFixture(browser!, fixturePath, width);

      expect(result.noHorizontalOverflow).toBe(true);
      expect(result.controlFontSize).toBe("16px");
      expect(result.controlLineHeight).toBe("28px");
      expect(result.labelFontSize).toBe("14px");
      expect(result.labelLineHeight).toBe("20px");
      expect(result.optionalFontSize).toBe("13px");
      expect(result.optionalLineHeight).toBe("18px");
      expect(result.helpFontSize).toBe("13px");
      expect(result.helpLineHeight).toBe("18px");
      expect(result.errorFontSize).toBe("13px");
      expect(result.errorLineHeight).toBe("18px");
      expect(result.copyFontSize).toBe("15px");
      expect(result.copyLineHeight).toBe("24px");
      expect(result.labelControlGap).toBe(8);
      expect(result.controlMessageGap).toBe(8);
      expect(result.helpErrorGap).toBe(8);
      expect(result.fieldGap).toBe(20);
      expect(result.legendChoiceGap).toBe(8);
      expect(result.contentActionGap).toBe(24);
    });
  }, 45_000);
});
