import { describe, expect, it, vi } from "vitest";
import { runWecomTicketProbe } from "./wecom-ticket-probe";

const env = { WECOM_BASE_URL: "https://wecom.example.invalid", WECOM_APP_ID: "synthetic-app", WECOM_APP_KEY: "synthetic-secret", WECOM_TEST_USER_ID: "000071", WECOM_TEST_TOKEN: "synthetic-ticket" };

describe("intranet WeCom ticket diagnostic", () => {
  it("defaults to a local configuration check with no network or credential output", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await runWecomTicketProbe([], env, fetcher);
    expect(result).toEqual({ exitCode: 0, report: { probe: "wecom-ticket", result: "configuration_valid", networkAttempted: false, ticketDisposition: "not_submitted", sessionCreated: false } });
    expect(fetcher).not.toHaveBeenCalled();
    for (const secret of Object.values(env)) expect(JSON.stringify(result)).not.toContain(secret);
  });
  it("reports only missing variable names and rejects invalid configuration before network", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await runWecomTicketProbe([], {}, fetcher)).report.missing).toEqual(["WECOM_BASE_URL", "WECOM_APP_ID", "WECOM_APP_KEY"]);
    expect((await runWecomTicketProbe(["--verify-once"], { ...env, WECOM_BASE_URL: "http://wecom.example.invalid" }, fetcher)).report.result).toBe("configuration_invalid");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires an explicit single verification and well-formed ticket input", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await runWecomTicketProbe(["--token", "secret"], env, fetcher)).report.result).toBe("invalid_arguments");
    expect((await runWecomTicketProbe(["--verify-once"], { ...env, WECOM_TEST_TOKEN: undefined }, fetcher)).report.result).toBe("ticket_input_required");
    expect((await runWecomTicketProbe(["--verify-once"], { ...env, WECOM_TEST_USER_ID: " 000071" }, fetcher)).report.result).toBe("ticket_input_required");
    expect((await runWecomTicketProbe(["--verify-once"], { ...env, WECOM_TEST_TOKEN: "ticket\u0085" }, fetcher)).report).toMatchObject({ result: "ticket_input_required", networkAttempted: false, ticketDisposition: "not_submitted" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("verifies once and returns no personal data, keys or ticket", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ code: "0", detailCode: "0", msg: { EMPID: env.WECOM_TEST_USER_ID, EMPNAME: "合成员工", USERID: "synthetic-wecom-id", DIVISION: "合成组织" } }));
    const result = await runWecomTicketProbe(["--verify-once"], env, fetcher);
    expect(result).toEqual({ exitCode: 0, report: { probe: "wecom-ticket", result: "identity_verified", networkAttempted: true, ticketDisposition: "may_be_consumed", sessionCreated: false, accountMatchesRequested: true, nameProvided: true, wecomUserIdProvided: true, divisionProvided: true } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const value of [...Object.values(env), "合成员工", "synthetic-wecom-id", "合成组织"]) expect(JSON.stringify(result)).not.toContain(value);
  });
  it("does not retry or expose transport errors and treats ticket consumption as uncertain", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error(`private ${env.WECOM_APP_KEY} ${env.WECOM_TEST_TOKEN}`); });
    const result = await runWecomTicketProbe(["--verify-once"], env, fetcher);
    expect(result.report).toMatchObject({ result: "service_unavailable", networkAttempted: true, ticketDisposition: "may_be_consumed", sessionCreated: false });
    expect(result.exitCode).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain(env.WECOM_APP_KEY);
    expect(JSON.stringify(result)).not.toContain(env.WECOM_TEST_TOKEN);
  });
  it("reports identity rejection without echoing the upstream response", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ code: "1", msg: env.WECOM_TEST_TOKEN, detailCode: "0" }));
    const result = await runWecomTicketProbe(["--verify-once"], env, fetcher);
    expect(result.report.result).toBe("identity_rejected");
    expect(result.report.ticketDisposition).toBe("may_be_consumed");
    expect(JSON.stringify(result)).not.toContain(env.WECOM_TEST_TOKEN);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
