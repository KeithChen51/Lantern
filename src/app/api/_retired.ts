/** Disabled legacy entry points never parse credentials or perform writes. */
export function retired() {
  return Response.json({ error: { code: "gone", message: "此入口已停用，请使用员工统一登录及知识管理入口。" } }, {
    status: 410, headers: { "Cache-Control": "private, no-store" },
  });
}
