import { headers } from "next/headers";
import Link from "next/link";
import { requireKnowledgeAdmin } from "@/modules/auth/access";
import { AdminKnowledgeManager } from "./AdminKnowledgeManager";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgePage() {
  try { await requireKnowledgeAdmin(await headers()); } catch (error) {
    const forbidden = error && typeof error === "object" && "status" in error && error.status === 403;
    return <section role="alert"><h1>知识管理</h1><p>{forbidden ? "当前员工账号没有知识管理权限。" : "登录或权限验证暂不可用，请稍后重试。"}</p><Link href="/">返回首页</Link></section>;
  }

  return <AdminKnowledgeManager />;
}
