import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";
import { buildSync } from "esbuild";
import { checkResolvedAccessConfig } from "../../scripts/check-access-config";

const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const roots: string[] = [];
const unix = (value: string) => process.platform === "win32"
  ? spawnSync(bash, ["-c", 'cygpath -u "$1"', "sh", value], { encoding: "utf8" }).stdout.trim()
  : value;
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error("Refusing unsafe fixture cleanup");
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lighthouse-ops-")); roots.push(root);
  const data = join(root, "data"); const app = join(data, "app"); const backups = join(root, "backups");
  mkdirSync(app, { recursive: true }); mkdirSync(join(data, "mysql"));
  writeFileSync(join(data, ".lighthouse-owner"), "lighthouse-test|test\n");
  writeFileSync(join(app, "upload.txt"), "important existing upload");
  const runtime = join(root, "app.env"); writeFileSync(runtime, "AUTH_ENCRYPTION_KEY=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=\n");
  const image = (name: string, hash: string) => `registry.example/${name}@sha256:${hash.repeat(64)}`;
  const appImage = image("app", "a"); const toolsImage = image("tools", "b"); const mysqlImage = image("mysql", "c");
  const config = join(root, "control.env");
  writeFileSync(config, ["ENVIRONMENT=test", "COMPOSE_PROJECT_NAME=lighthouse-test", `DATA_ROOT=${unix(data)}`, `BACKUP_ROOT=${unix(backups)}`, `APP_ENV_FILE=${unix(runtime)}`, `LIGHTHOUSE_IMAGE=${appImage}`, `LIGHTHOUSE_TOOLS_IMAGE=${toolsImage}`, `MYSQL_IMAGE=${mysqlImage}`, "MYSQL_DATABASE=lighthouse_test", "MYSQL_USER=lighthouse_test", "MYSQL_PASSWORD='private-db-secret'", "MYSQL_ROOT_PASSWORD='distinct-root-secret'", "DATABASE_URL='mysql://lighthouse_test:private-db-secret@mysql:3306/lighthouse_test'", "HTTP_BIND=0.0.0.0", "HTTP_PORT=18081", "GATEWAY_ENABLED=false", ""].join("\n"));
  const authChecker = join(root, "check-access-config.cjs");
  buildSync({ entryPoints: [resolve("scripts/check-access-config.ts")], outfile: authChecker, bundle: true, platform: "node", target: "node20", format: "cjs" });
  writeFileSync(join(root, "fake-config.json"), JSON.stringify({ dataRoot: unix(data), appImage, authChecker }));
  const bin = join(root, "bin"); mkdirSync(bin);
  writeFileSync(join(bin, "docker"), '#!/usr/bin/env bash\nexec "$FAKE_NODE" -- "$FAKE_SCRIPT" "$@"\n', { mode: 0o755 });
  const env = { ...process.env, MSYS_NO_PATHCONV: "1", PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`, FAKE_FIXTURE: root, FAKE_NODE: process.execPath.replaceAll("\\", "/"), FAKE_SCRIPT: resolve("scripts/intranet/environment/fake-docker.mjs").replaceAll("\\", "/") };
  const run = (mode: string, extra: Record<string, string> = {}, extraArgs: string[] = []) => spawnSync(bash, [resolve("scripts/intranet/environment/environment.sh"), mode, config, ...extraArgs], { env: { ...env, MSYS_NO_PATHCONV: "1", ...extra }, encoding: "utf8" });
  const calls = () => existsSync(join(root, "docker-calls.jsonl")) ? readFileSync(join(root, "docker-calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]) : [];
  return { root, data, app, backups, config, appImage, toolsImage, env, run, calls };
}

describe("guarded deployment orchestration", () => {
  const guestEnvironment = () => ({
    NODE_ENV: "production", LIGHTHOUSE_DEPLOYMENT_ENV: "production", AUTH_MODE: "guest",
    LIGHTHOUSE_ORIGIN: "https://lighthouse.example.invalid", AUTH_TEST_HTTP_ORIGIN: "", AUTH_ALLOW_LOCAL_HTTP: "false",
    AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    DATABASE_URL: "mysql://app:synthetic@mysql:3306/lighthouse_production", KNOWLEDGE_HUB_ENABLED: "true", KNOWLEDGE_HUB_DRIVER: "mysql",
  });
  it("preflights a deployed guest without employee credentials and retains the exact test HTTP exception", () => {
    const environment = guestEnvironment();
    expect(() => checkResolvedAccessConfig({ services: { app: { environment } } }, "app", "production")).not.toThrow();
    Object.assign(environment, { LIGHTHOUSE_DEPLOYMENT_ENV: "test", LIGHTHOUSE_ORIGIN: "http://10.20.30.40:18081", AUTH_TEST_HTTP_ORIGIN: "http://10.20.30.40:18081" });
    expect(() => checkResolvedAccessConfig({ services: { app: { environment } } }, "app", "test")).not.toThrow();
    expect(() => checkResolvedAccessConfig({ services: { app: { environment } } }, "app", "production")).toThrow();
  });
  it.each([
    { AUTH_MODE: undefined }, { AUTH_MODE: "unknown" }, { AUTH_MODE: "iam" }, { AUTH_MODE: "portal" },
    { AUTH_ENCRYPTION_KEY: undefined }, { AUTH_ENCRYPTION_KEY: "invalid" },
    { LIGHTHOUSE_ORIGIN: "http://10.20.30.40:18081" }, { AUTH_TEST_HTTP_ORIGIN: "http://10.20.30.40:18081" },
    { LIGHTHOUSE_ORIGIN: "https://lighthouse.example.invalid/path" }, { AUTH_ALLOW_LOCAL_HTTP: "true" },
    { DATABASE_URL: undefined }, { KNOWLEDGE_HUB_DRIVER: "sqlite" }, { KNOWLEDGE_HUB_ENABLED: "false" }, { NODE_ENV: "development" },
  ])("refuses invalid guest/deployment configuration rather than falling back: %j", (overrides) => {
    const environment = { ...guestEnvironment(), ...overrides };
    expect(() => checkResolvedAccessConfig({ services: { app: { environment } } }, "app", "production")).toThrow();
  });
  it("retains the private stable-key template and explicit IAM/guest separation", () => {
    const guest = readFileSync("deploy/intranet/environments/guest-app.env.example", "utf8");
    expect(guest).toMatch(/^AUTH_MODE=guest$/m);
    expect(guest).toMatch(/^NODE_ENV=production$/m);
    expect(guest).toMatch(/^AUTH_ENCRYPTION_KEY=/m);
    expect(guest).not.toMatch(/^(?:IAM_|PORTAL_|MYSQL_ROOT_PASSWORD=)/m);
    for (const template of ["app.env.example", "test-app.env.example"]) {
      expect(readFileSync(`deploy/intranet/environments/${template}`, "utf8")).toMatch(/^AUTH_MODE=iam$/m);
    }
  });
  it("has syntactically valid Bash and isolates MySQL, app secrets and ready checks", () => {
    for (const script of ["environment.sh", "existing-test.sh"]) expect(spawnSync(bash, ["-n", resolve("scripts/intranet/environment", script)]).status).toBe(0);
    const config = parse(readFileSync("deploy/intranet/environments/compose.yaml", "utf8"));
    const gateway = parse(readFileSync("deploy/intranet/environments/gateway.override.yaml", "utf8"));
    expect(gateway.services.app.networks.gateway.aliases).toHaveLength(1);
    expect(config.services.mysql.ports).toBeUndefined();
    expect(config.services.app.environment.MYSQL_ROOT_PASSWORD).toBeUndefined();
    expect(config.services.app.healthcheck.test.join(" ")).toContain("r.status===200");
    expect(config.services.app.healthcheck.test.join(" ")).toContain("redirect:'manual'");
    expect(config.services.app.networks.runtime).toEqual({});
    expect(config.services.operations.command).toEqual(["verify"]);
  }, 30_000);
  it("backs up before migration and never initializes on ordinary upgrade", () => {
    const f = fixture(); const result = f.run("upgrade", { FAKE_OLD_AUTH: "1" });
    expect(result.status, result.stderr).toBe(0);
    const calls = f.calls();
    const stop = calls.findIndex(x => x.includes("stop"));
    const dump = calls.findIndex(x => x.some(y => y.includes("mysqldump")));
    const migrate = calls.findIndex(x => x.at(-1) === "migrate");
    const up = calls.findIndex(x => x.includes("up") && x.at(-1) === "app");
    const authCheck = calls.findIndex(x => x.includes("/app/check-access-config.cjs"));
    expect(authCheck).toBeGreaterThan(-1); expect(stop).toBeGreaterThan(authCheck); expect(dump).toBeGreaterThan(stop); expect(migrate).toBeGreaterThan(dump); expect(up).toBeGreaterThan(migrate);
    expect(calls.some(x => x.at(-1) === "initialize" || x.some(y => /db:setup|db:seed/.test(y)))).toBe(false);
    expect(readFileSync(join(f.app, "upload.txt"), "utf8")).toBe("important existing upload");
    expect(result.stdout).not.toContain("private-db-secret");
  }, 30_000);
  it("upgrades explicit guest without employee credentials through the same backup and migration guards", () => {
    const f = fixture();
    const configFile = join(f.root, "fake-config.json");
    const authOverrides = {
      AUTH_MODE: "guest", PORTAL_API_BASE_URL: null, PORTAL_LOGIN_URL: null, PORTAL_APP_CODE: null,
      PORTAL_APP_SECRET: null, PORTAL_KNOWLEDGE_ADMIN_ROLE: null, PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: null,
    };
    writeFileSync(configFile, JSON.stringify({ ...JSON.parse(readFileSync(configFile, "utf8")), authOverrides }));
    const result = f.run("upgrade", { FAKE_OLD_AUTH: "1" });
    expect(result.status, result.stderr).toBe(0);
    const calls = f.calls();
    const preflight = calls.findIndex(x => x.includes("/app/check-access-config.cjs"));
    const stop = calls.findIndex(x => x.includes("stop"));
    const dump = calls.findIndex(x => x.some(y => y.includes("mysqldump")));
    const migrate = calls.findIndex(x => x.at(-1) === "migrate");
    const up = calls.findIndex(x => x.includes("up") && x.at(-1) === "app");
    expect(preflight).toBeGreaterThan(-1); expect(stop).toBeGreaterThan(preflight);
    expect(dump).toBeGreaterThan(stop); expect(migrate).toBeGreaterThan(dump); expect(up).toBeGreaterThan(migrate);
    expect(calls.some(x => x.at(-1) === "initialize" || x.some(y => /db:setup|db:seed|hub:bootstrap|hub:import-existing/.test(y)))).toBe(false);
    expect(readFileSync(join(f.app, "upload.txt"), "utf8")).toBe("important existing upload");
  }, 30_000);
  it("refuses a valid guest key rotation before app stop, backup or migration", () => {
    const f = fixture();
    const configFile = join(f.root, "fake-config.json");
    writeFileSync(configFile, JSON.stringify({ ...JSON.parse(readFileSync(configFile, "utf8")), authOverrides: {
      AUTH_MODE: "guest", AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64"),
    } }));
    const result = f.run("upgrade", { FAKE_OLD_AUTH: "1" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("credential-encryption key changed");
    expect(f.calls().some(x => x.includes("stop") || x.includes("up") || x.at(-1) === "migrate" || x.some(y => y.includes("mysqldump")))).toBe(false);
  }, 30_000);
  it("validates the selected production deployment and rejects a mismatched target", () => {
    const f = fixture();
    const resolved = spawnSync(process.execPath, [f.env.FAKE_SCRIPT, "compose", "config", "--format", "json"], { env: f.env, encoding: "utf8" });
    expect(resolved.status).toBe(0);
    const config = JSON.parse(resolved.stdout);
    Object.assign(config.services.app.environment, { LIGHTHOUSE_DEPLOYMENT_ENV: "production", LIGHTHOUSE_ORIGIN: "https://lighthouse.example.invalid", AUTH_TEST_HTTP_ORIGIN: "" });
    const check = (deployment: string) => spawnSync(process.execPath, [join(f.root, "check-access-config.cjs"), "app", deployment], { input: JSON.stringify(config), encoding: "utf8" });
    expect(check("production").status).toBe(0);
    expect(check("test").status).toBe(1);
    expect(check("restore").status).toBe(1);
    expect(check("test").stderr).not.toContain("synthetic-portal-secret");
  }, 30_000);
  it("refuses incomplete selected IAM configuration before app stop or database work", () => {
    const f = fixture();
    const configFile = join(f.root, "fake-config.json");
    writeFileSync(configFile, JSON.stringify({ ...JSON.parse(readFileSync(configFile, "utf8")), authOverrides: { AUTH_MODE: "iam", IAM_CLIENT_SECRET: "do-not-print-this-secret" } }));
    const result = f.run("upgrade");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Resolved authentication configuration refused");
    expect(result.stderr).not.toContain("do-not-print-this-secret");
    expect(f.calls().some(x => x.includes("stop") || x.includes("up") || x.at(-1) === "migrate" || x.some(y => y.includes("mysqldump")))).toBe(false);
  }, 30_000);
  it("restarts the prior app after failed backup and does not migrate", () => {
    const f = fixture(); const result = f.run("upgrade", { FAKE_FAIL_BACKUP: "1" });
    expect(result.status).not.toBe(0);
    expect(f.calls().some(x => x.includes("start") && x.at(-1) === "app")).toBe(true);
    expect(f.calls().some(x => x.at(-1) === "migrate")).toBe(false);
    expect(f.calls().some(x => x.includes("up"))).toBe(false);
  }, 30_000);
  it("keeps app stopped after failed migration and retains the successful backup", () => {
    const f = fixture(); const result = f.run("upgrade", { FAKE_FAIL_MIGRATE: "1" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Completed backup:");
    expect(f.calls().some(x => x.includes("start") || (x.includes("up") && x.at(-1) === "app"))).toBe(false);
  }, 30_000);
  it("rejects mismatched image provenance before stopping or changing data", () => {
    const f = fixture(); const result = f.run("upgrade", { FAKE_LABEL_MISMATCH: "1" });
    expect(result.status).not.toBe(0); expect(result.stderr).toContain("does not match");
    expect(f.calls().some(x => x.includes("stop") || x.at(-1) === "migrate")).toBe(false);
  }, 30_000);
  it("rejects a valid but different target database before app stop, backup or migration", () => {
    const f = fixture();
    writeFileSync(f.config, readFileSync(f.config, "utf8")
      .replace("MYSQL_DATABASE=lighthouse_test", "MYSQL_DATABASE=lighthouse_other")
      .replace("@mysql:3306/lighthouse_test", "@mysql:3306/lighthouse_other"));
    const result = f.run("upgrade");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Do not change the existing database connection");
    expect(result.stderr).not.toContain("private-db-secret");
    expect(f.calls().some(x => x.includes("stop") || x.includes("up") || x.at(-1) === "migrate" || x.some(y => y.includes("mysqldump")))).toBe(false);
    expect(readFileSync(join(f.app, "upload.txt"), "utf8")).toBe("important existing upload");
  }, 30_000);
  it("refuses initialization on existing files and refuses shell interpolation", () => {
    const f = fixture(); const result = f.run("initialize");
    expect(result.status).not.toBe(0); expect(result.stderr).toContain("empty MySQL and app");
    expect(f.calls().some(x => x.includes("up"))).toBe(false);
    writeFileSync(f.config, readFileSync(f.config, "utf8").replace("HTTP_PORT=18081", "HTTP_PORT=$(touch injected)"));
    const injection = f.run("verify"); expect(injection.status).not.toBe(0); expect(existsSync("injected")).toBe(false);
  }, 30_000);
  it("refuses data/backup overlap before invoking Docker", () => {
    const f = fixture(); writeFileSync(f.config, readFileSync(f.config, "utf8").replace(`BACKUP_ROOT=${unix(f.backups)}`, `BACKUP_ROOT=${unix(f.data)}/backup`));
    const result = f.run("backup"); expect(result.status).not.toBe(0); expect(result.stderr).toContain("must be separate");
    expect(f.calls()).toEqual([]);
  }, 30_000);
  it("restores DB and uploads into a new isolated root without starting an app", () => {
    const f = fixture(); const backup = f.run("backup"); expect(backup.status, backup.stderr).toBe(0);
    const backupDir = backup.stdout.match(/Completed backup: (.+)/)?.[1]; expect(backupDir).toBeTruthy();
    const target = join(f.root, "restored");
    const control = readFileSync(f.config, "utf8").replace("ENVIRONMENT=test", "ENVIRONMENT=restore").replace("COMPOSE_PROJECT_NAME=lighthouse-test", "COMPOSE_PROJECT_NAME=lighthouse-restore").replace(`DATA_ROOT=${unix(f.data)}`, `DATA_ROOT=${unix(target)}`).replace("MYSQL_DATABASE=lighthouse_test", "MYSQL_DATABASE=lighthouse_restore").replace("@mysql:3306/lighthouse_test", "@mysql:3306/lighthouse_restore");
    writeFileSync(f.config, control);
    const before = f.calls().length;
    const result = f.run("restore-verify", {}, [backupDir!]); expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(target, "app", "upload.txt"), "utf8")).toBe("important existing upload");
    expect(existsSync(join(target, "recovery", "original-app-container.json"))).toBe(true);
    const comparator = f.calls().slice(before).find(x => x.includes("/compare-mysql-dumps.mjs"));
    expect(comparator).toBeTruthy();
    expect(comparator).toContain("--read-only");
    expect(comparator).toContain("none");
    expect(comparator).toContain("0:0");
    expect(comparator?.filter(x => x.startsWith("type=bind,")).every(x => x.endsWith(",readonly"))).toBe(true);
    expect(result.stdout).toContain('"equal":true');
    expect(f.calls().slice(before).some(x => x.at(-1) === "app" || x.at(-1) === "initialize" || x.at(-1) === "migrate")).toBe(false);
    const second = f.run("restore-verify", {}, [backupDir!]); expect(second.status).not.toBe(0); expect(second.stderr).toContain("new empty root");
    writeFileSync(f.config, control.replace(`DATA_ROOT=${unix(target)}`, `DATA_ROOT=${unix(join(f.root, "corrupted-restore"))}`));
    const corrupted = f.run("restore-verify", { FAKE_CORRUPT_DUMP: "1" }, [backupDir!]);
    expect(corrupted.status).not.toBe(0);
    expect(corrupted.stdout).toContain('"equal":false');
    expect(corrupted.stderr).toContain("Restored logical database differs");
  }, 30_000);
  it.each(["app-equal", "app-child", "app-parent", "mysql-equal", "mysql-child", "mysql-parent"])("rejects existing-test backup root overlapping actual data: %s", (scenario) => {
    const f = fixture(); const composeFile = join(f.root, "legacy.yaml"); writeFileSync(composeFile, "services: {}\n");
    let target: string;
    if (scenario === "mysql-parent") {
      target = join(f.data, "mysql", "nested");
      const mysqlRoot = join(target, "database"); mkdirSync(mysqlRoot, { recursive: true });
      const configFile = join(f.root, "fake-config.json");
      writeFileSync(configFile, JSON.stringify({ ...JSON.parse(readFileSync(configFile, "utf8")), mysqlRoot: unix(mysqlRoot) }));
    } else {
      const source = scenario.startsWith("app") ? f.app : join(f.data, "mysql");
      target = scenario.endsWith("equal") ? source : scenario.endsWith("child") ? join(source, "backup") : f.data;
    }
    const before = existsSync(target) ? readdirSync(target).sort() : undefined;
    const result = spawnSync(bash, [resolve("scripts/intranet/environment/existing-test.sh"), "backup", composeFile, f.config, "legacy-test", unix(target), f.appImage, f.toolsImage, "existing_app"], { env: f.env, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Backup directory must be separate from actual data mounts");
    expect(f.calls().some(x => x.includes("stop") || x.some(y => y.includes("mysqldump")) || x.includes("--volumes-from"))).toBe(false);
    expect(existsSync(`${f.config}.operations-lock`)).toBe(false);
    if (before) expect(readdirSync(target).sort()).toEqual(before);
    else expect(existsSync(target)).toBe(false);
  }, 30_000);
  it("upgrades the existing test with no dependency startup, new volume or initialization", () => {
    const f = fixture(); const composeFile = join(f.root, "legacy.yaml"); writeFileSync(composeFile, "services: {}\n");
    const archive = spawnSync(bash, ["-c", 'tar -czf "$1" -C "$2" .', "sh", unix(join(f.root, "fixture.tar.gz")), unix(f.app)]);
    expect(archive.status).toBe(0);
    const files = spawnSync(bash, ["-c", 'cd "$1"; sha256sum upload.txt', "sh", unix(f.app)], { encoding: "utf8" }).stdout;
    writeFileSync(join(f.root, "fixture-files.sha256"), files);
    const result = spawnSync(bash, [resolve("scripts/intranet/environment/existing-test.sh"), "upgrade", composeFile, f.config, "legacy-test", unix(f.backups), f.appImage, f.toolsImage, "existing_app"], { env: f.env, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const calls = f.calls(); const migrate = calls.findIndex(x => x[0] === "run" && x.at(-1) === "migrate");
    const authCheck = calls.findIndex(x => x.includes("/app/check-access-config.cjs"));
    const stop = calls.findIndex(x => x.includes("stop"));
    expect(authCheck).toBeGreaterThan(-1); expect(stop).toBeGreaterThan(authCheck);
    expect(calls[authCheck]).toContain("--network"); expect(calls[authCheck]).toContain("none"); expect(calls[authCheck]).toContain("--read-only");
    const up = calls.findIndex(x => x.includes("up")); expect(up).toBeGreaterThan(migrate);
    expect(calls[up]).toContain("--no-deps"); expect(calls[up].at(-1)).toBe("lighthouse");
    expect(calls.some(x => x.includes("--renew-anon-volumes") || x.at(-1) === "initialize" || x.some(y => /db:setup|db:seed/.test(y)))).toBe(false);
    expect(readFileSync(f.config, "utf8")).toContain(`LH_IMAGE=${f.appImage}`);
    expect(result.stdout).not.toContain("private-db-secret");
  }, 30_000);
  it.each([
    { AUTH_MODE: null }, { PORTAL_API_BASE_URL: null }, { PORTAL_LOGIN_URL: null },
    { PORTAL_APP_CODE: null }, { PORTAL_APP_SECRET: null }, { PORTAL_KNOWLEDGE_ADMIN_ROLE: null },
    { AUTH_ENCRYPTION_KEY: "invalid-private-key" }, { PORTAL_EMPLOYEE_VALIDATION_CONFIRMED: "false" },
    { DATABASE_URL: null }, { KNOWLEDGE_HUB_DRIVER: "sqlite" }, { KNOWLEDGE_HUB_ENABLED: "false" },
    { LIGHTHOUSE_ORIGIN: "http://10.20.30.40:18082" }, { AUTH_TEST_HTTP_ORIGIN: null },
    { PORTAL_LOGIN_URL: "http://10.20.30.40/login" }, { PORTAL_STATE_PARAM: "token" },
    { NODE_ENV: "development" }, { LIGHTHOUSE_DEPLOYMENT_ENV: "production" }, { AUTH_ALLOW_LOCAL_HTTP: "true" },
  ])("rejects incomplete or invalid resolved existing-test auth before stopping app: %j", (authOverrides) => {
    const f = fixture(); const composeFile = join(f.root, "legacy.yaml"); writeFileSync(composeFile, "services: {}\n");
    const configFile = join(f.root, "fake-config.json");
    writeFileSync(configFile, JSON.stringify({ ...JSON.parse(readFileSync(configFile, "utf8")), authOverrides }));
    const result = spawnSync(bash, [resolve("scripts/intranet/environment/existing-test.sh"), "upgrade", composeFile, f.config, "legacy-test", unix(f.backups), f.appImage, f.toolsImage, "existing_app"], { env: f.env, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Resolved authentication configuration refused");
    expect(result.stderr).not.toMatch(/private-db-secret|invalid-private-key|synthetic-portal-secret/);
    expect(f.calls().some(x => x.includes("stop") || x.includes("up") || x.at(-1) === "migrate" || x.some(y => y.includes("mysqldump")))).toBe(false);
    expect(existsSync(`${f.config}.operations-lock`)).toBe(false);
    expect(readFileSync(join(f.app, "upload.txt"), "utf8")).toBe("important existing upload");
  }, 30_000);
});
