import { redirect } from "next/navigation";
export default function LegacyAdminLoginPage() { redirect("/login?returnTo=%2Fadmin%2Fknowledge"); }
