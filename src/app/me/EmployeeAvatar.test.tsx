import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployeeAvatar } from "./EmployeeAvatar";

describe("employee avatar", () => {
  it.each([undefined, "http://images.example.invalid/a.png", "javascript:alert(1)", "https://name:secret@example.invalid/a.png"])("uses an initial for an absent or unsafe URL: %s", (avatarUrl) => {
    const html = renderToStaticMarkup(<EmployeeAvatar displayName="测试员工" avatarUrl={avatarUrl} />);
    expect(html).toContain(">测</span>");
    expect(html).not.toContain("<img");
  });
});
