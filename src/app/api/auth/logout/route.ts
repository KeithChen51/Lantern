import { logout } from "@/modules/auth/access-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = logout(false);
