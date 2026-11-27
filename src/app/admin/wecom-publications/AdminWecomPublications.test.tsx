import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminWecomPublications } from "./AdminWecomPublications";

describe("publication workspace", () => {
  it("names application fields independently and makes Beijing time explicit", () => {
    const html = renderToStaticMarkup(<AdminWecomPublications channels={[
      { id: "group", label: "集团应用", coverLimit: 2 * 1024 * 1024, bodyImageLimit: 2 * 1024 * 1024 },
      { id: "auto", label: "汽车应用", coverLimit: 10 * 1024 * 1024, bodyImageLimit: 2 * 1024 * 1024 },
    ]} />);
    expect(html).toContain('aria-label="集团应用成员账号"');
    expect(html).toContain('aria-label="汽车应用成员账号"');
    expect(html).toContain("发送时间（北京时间）");
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('aria-labelledby="confirm-publication-title"');
    expect(html).toContain('name="images"');
    expect(html).toContain("核对并确认排期");
    expect(html).not.toContain("重试集团应用");
  });

  it("shows a recoverable state without configured applications", () => {
    const html = renderToStaticMarkup(<AdminWecomPublications channels={[]} />);
    expect(html).toContain("尚无可用发布应用");
    expect(html).not.toContain('type="datetime-local"');
  });
});
