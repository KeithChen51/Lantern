import { runWecomTicketProbe } from "../src/modules/auth/wecom-ticket-probe";

async function main() {
  const { report, exitCode } = await runWecomTicketProbe(process.argv.slice(2), process.env);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = exitCode;
}

void main().catch(() => {
  // Never print raw exceptions, environment values or upstream error causes.
  process.stdout.write(`${JSON.stringify({ probe: "wecom-ticket", result: "probe_failed", sessionCreated: false })}\n`);
  process.exitCode = 1;
});
