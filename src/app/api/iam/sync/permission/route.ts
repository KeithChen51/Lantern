import { iamSyncHandlers } from "@/modules/auth/iam-sync-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = iamSyncHandlers.permission;
