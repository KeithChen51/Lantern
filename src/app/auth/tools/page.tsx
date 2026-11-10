import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ToolGrants } from "@/components/auth/ToolGrants";
import { requireEmployee } from "@/modules/auth/access";

export default async function ToolGrantsPage() {
  const principal = await requireEmployee(await headers());
  if (!principal.capabilities.includes("auth:client:self")) redirect("/login?error=wecomGroupTool");
  return <ToolGrants />;
}
