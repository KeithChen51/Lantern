import { describe, expect, it, vi } from "vitest";
import { createDevOpsIssue, type IssueFetch } from "./issues";

describe("BYD DevOps issue client", () => {
  it("creates an Issue with server-side token authentication only", async () => {
    const fetchMock = vi.fn<IssueFetch>().mockResolvedValue(
      new Response(JSON.stringify({ number: "1", html_url: "https://devops.byd.com/issues/1" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    const issue = await createDevOpsIssue(
      { title: "[意见反馈] 测试", body: "## 反馈内容\n测试" },
      {
        BYD_DEVOPS_ISSUES_API_URL: "https://devops.byd.com/api/gitee/api/v5/repos/QCSHFW/lin.zixuan/Lighthouse/issues",
        BYD_DEVOPS_AUTH_MODE: "authorization-token",
        BYD_DEVOPS_TOKEN: "server-token",
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://devops.byd.com/api/gitee/api/v5/repos/QCSHFW/lin.zixuan/Lighthouse/issues");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "token server-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      title: "[意见反馈] 测试",
      body: "## 反馈内容\n测试",
    });
    expect(String(init?.body)).not.toContain("access_token");
    expect(issue).toEqual({ number: "1", url: "https://devops.byd.com/issues/1" });
  });

  it("fails safely when the server configuration is incomplete", async () => {
    await expect(
      createDevOpsIssue(
        { title: "[意见反馈] 测试", body: "## 反馈内容\n测试" },
        { BYD_DEVOPS_ISSUES_API_URL: "https://devops.byd.com/issues" },
        vi.fn<IssueFetch>(),
      ),
    ).rejects.toMatchObject({ code: "integration_error", status: 503 });
  });
});
