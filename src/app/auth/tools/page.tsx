import { headers } from "next/headers";
import { ToolGrants } from "@/components/auth/ToolGrants";
import { requireWebAccount } from "@/modules/auth/access";

export default async function ToolGrantsPage() {
  await requireWebAccount(await headers());
  return <ToolGrants />;
}
