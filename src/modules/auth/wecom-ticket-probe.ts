import { AccessError } from "./access-types";
import { WecomTicketClient } from "./wecom-ticket-client";

type ProbeEnvironment = Readonly<Record<string, string | undefined>>;
export type WecomProbeReport = {
  probe: "wecom-ticket";
  result: "configuration_valid" | "configuration_invalid" | "invalid_arguments" | "ticket_input_required" | "identity_verified" | "identity_rejected" | "service_unavailable";
  networkAttempted: boolean;
  ticketDisposition: "not_submitted" | "may_be_consumed";
  sessionCreated: false;
  missing?: string[];
  accountMatchesRequested?: boolean;
  nameProvided?: boolean;
  wecomUserIdProvided?: boolean;
  divisionProvided?: boolean;
};

/** Diagnostic only. No account writes, session issuance, role changes or retries.
 * Return booleans/statuses instead of upstream identity or credential material. */
export async function runWecomTicketProbe(args: readonly string[], env: ProbeEnvironment, fetcher: typeof fetch = fetch): Promise<{ exitCode: number; report: WecomProbeReport }> {
  const report: WecomProbeReport = { probe: "wecom-ticket", result: "invalid_arguments", networkAttempted: false, ticketDisposition: "not_submitted", sessionCreated: false };
  const finish = (result: WecomProbeReport["result"], exitCode = 1) => ({ exitCode, report: { ...report, result } });
  if (args.length > 1 || (args.length === 1 && !["--check-config", "--verify-once"].includes(args[0]))) return finish("invalid_arguments");

  const required = ["WECOM_BASE_URL", "WECOM_APP_ID", "WECOM_APP_KEY"] as const;
  const missing = required.filter(name => !env[name]);
  if (missing.length) { report.missing = missing; return finish("configuration_invalid"); }

  let client: WecomTicketClient;
  try {
    const trackedFetcher: typeof fetch = (...request) => {
      report.networkAttempted = true;
      report.ticketDisposition = "may_be_consumed";
      return fetcher(...request);
    };
    client = new WecomTicketClient({ baseUrl: env.WECOM_BASE_URL!, appId: env.WECOM_APP_ID!, appKey: env.WECOM_APP_KEY! }, trackedFetcher);
  } catch { return finish("configuration_invalid"); }
  if (args[0] !== "--verify-once") return finish("configuration_valid", 0);

  const userId = env.WECOM_TEST_USER_ID, token = env.WECOM_TEST_TOKEN;
  if (!userId || !/^[A-Za-z0-9._-]{1,80}$/.test(userId) || !token || token.length > 8192 || token.trim() !== token || /[\u0000-\u001f\u007f-\u009f]/.test(token)) return finish("ticket_input_required");
  // A timeout or rejected response cannot prove the platform did not consume
  // the ticket. Never advise rerunning this operation with the same ticket.
  try {
    const identity = await client.verify({ userId, token });
    return { exitCode: 0, report: { ...report, result: "identity_verified", accountMatchesRequested: identity.account === userId, nameProvided: Boolean(identity.displayName && identity.displayName !== identity.account), wecomUserIdProvided: Boolean(identity.wecomUserId), divisionProvided: Boolean(identity.division) } };
  } catch (error) {
    return finish(error instanceof AccessError && [400, 401, 403].includes(error.status) ? "identity_rejected" : "service_unavailable");
  }
}
