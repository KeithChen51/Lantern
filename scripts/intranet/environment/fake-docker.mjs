// Test double for host orchestration only; never used by deployment commands.
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const root = process.env.FAKE_FIXTURE;
const config = JSON.parse(fs.readFileSync(path.join(root, "fake-config.json"), "utf8"));
const stateFile = path.join(root, "fake-state.json");
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : { stopped: false, upgraded: false };
fs.appendFileSync(path.join(root, "docker-calls.jsonl"), `${JSON.stringify(args)}\n`);
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));
const out = value => process.stdout.write(Buffer.isBuffer(value) ? value : String(value));
const imageId = hash => `sha256:${hash.repeat(64)}`;
const revision = "1".repeat(40);
if (args[0] === "image") {
  const image = args.at(-1);
  const hash = image.includes("tools") ? "b" : image.includes("mysql") ? "c" : image === imageId("d") ? "d" : "a";
  if (args[3] === "{{.Id}}") out(imageId(hash));
  else out(`${imageId(hash)}|${hash === "d" ? "2".repeat(40) : process.env.FAKE_LABEL_MISMATCH && hash === "b" ? "3".repeat(40) : revision}|1.1.3`);
} else if (args[0] === "inspect") {
  const format = args[args.indexOf("--format") + 1];
  const id = args.at(-1);
  if (!args.includes("--format")) out(JSON.stringify([{ Id: id, Config: { Env: ["AUTH_ENCRYPTION_KEY=stable-secret"] } }]));
  else if (format.includes(".NetworkSettings.Networks")) out("existing_app\n");
  else if (format.includes(".Mounts")) {
    if (format.includes("/var/lib/mysql")) out(format.includes(".Type") ? `volume|original-mysql|${config.dataRoot}/mysql` : `${config.dataRoot}/mysql`);
    else if (format.includes(".Type")) out(`volume|original-anonymous|${config.dataRoot}/app`);
    else out(`${config.dataRoot}/app`);
  } else if (format.includes(".Config.Env")) out(`DATABASE_URL=mysql://lighthouse_test:private-db-secret@mysql:3306/lighthouse_test\n${process.env.FAKE_OLD_AUTH ? "AUTH_ENCRYPTION_KEY=stable-secret\n" : ""}`);
  else if (format.includes(".State.Running")) out(state.stopped ? "false" : "true");
  else if (format.includes(".State.Health")) out("healthy");
  else if (format === "{{.Image}}") out(imageId(id.includes("mysql") ? "c" : state.upgraded ? "a" : "d"));
} else if (args[0] === "compose") {
  if (args.includes("config")) {
    if (args.includes("json")) out(JSON.stringify({ services: { app: { environment: { AUTH_ENCRYPTION_KEY: "stable-secret" } }, lighthouse: { image: config.appImage, environment: { LIGHTHOUSE_DEPLOYMENT_ENV: "test", NODE_ENV: "production", AUTH_ALLOW_LOCAL_HTTP: "false", DATABASE_URL: "mysql://lighthouse_test:private-db-secret@mysql:3306/lighthouse_test", AUTH_ENCRYPTION_KEY: "stable-secret" } } } }));
  } else if (args.includes("ps")) {
    if (args.at(-1) === "app" || args.at(-1) === "lighthouse") out(state.upgraded ? "app-new" : "app-existing");
    else if (args.at(-1) === "mysql") out("mysql-existing");
    else if (process.env.FAKE_EXISTING_PROJECT) out("app-existing\nmysql-existing");
  } else if (args.includes("stop")) { state.stopped = true; save(); }
  else if (args.includes("start")) { state.stopped = false; save(); }
  else if (args.includes("up")) {
    if (args.at(-1) === "app" || args.at(-1) === "lighthouse") { state.upgraded = true; state.stopped = false; save(); }
  } else if (args.includes("run") && args.at(-1) === "migrate" && process.env.FAKE_FAIL_MIGRATE) process.exit(7);
  else if (args.includes("exec") && args.some(x => x.includes("mysqldump"))) {
    if (process.env.FAKE_FAIL_BACKUP) process.exit(8);
    out("CREATE TABLE resource (id int);\nINSERT INTO resource VALUES (1);\n");
  } else if (args.includes("exec") && args.some(x => x.includes("printf %s"))) out("lighthouse_test");
} else if (args[0] === "start") { state.stopped = false; save(); }
else if (args[0] === "run") {
  if (args.includes("node") && args.includes("-i")) {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const c = JSON.parse(input);
    if (args.at(-2) === "lighthouse") {
      const service = c.services.lighthouse;
      out(args.at(-1) === "image" ? service.image : service.environment[args.at(-1)] ?? "");
    } else out(c.services.app.environment.AUTH_ENCRYPTION_KEY);
  } else if (args.includes("--volumes-from")) {
    if (args.at(-1).includes("tar -czf")) out(fs.readFileSync(path.join(root, "fixture.tar.gz")));
    else out(fs.readFileSync(path.join(root, "fixture-files.sha256")));
  } else if (args.at(-1) === "migrate" && process.env.FAKE_FAIL_MIGRATE) process.exit(7);
}
