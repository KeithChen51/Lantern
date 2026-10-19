import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionProvider, useEmployeeSession } from "./SessionContext";

function Identity() {
  const session = useEmployeeSession();
  return <span>{session?.kind}:{session?.user.id}:{session?.user.displayName}</span>;
}

describe("site visitor session context", () => {
  it.each(["guest", "employee"] as const)("preserves %s ownership for consumers", kind => {
    const session = { kind, user: { id: `${kind}-fixture`, account: "", displayName: kind === "guest" ? "访客" : "测试员工" }, capabilities: ["hermit:chat"], csrfToken: "fixture", expiresAt: 1900000000000 };
    const html = renderToStaticMarkup(<SessionProvider session={session}><Identity /></SessionProvider>);
    expect(html).toBe(`<span>${kind}:${kind}-fixture:${session.user.displayName}</span>`);
  });
});
