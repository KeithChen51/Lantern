import { describe, expect, it } from "vitest";
import { normalizePublicationHtml, parsePublicationDraft, publicationPreview } from "./article";
import { imageMarker, type PublicationImage } from "./contracts";

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const image: PublicationImage = { name: "插画.png", mimeType: "image/png", bytes: pngBytes };

describe("WeCom article import and preview", () => {
  it("preserves the original, safe inline styling and embedded fonts while isolating the preview", async () => {
    const original = '<style>@font-face{font-family:Editorial;src:url(data:font/woff2;base64,AA==)}</style>'
      + '<article style="padding:0 22px" onclick="evil()"><script>evil()</script><h1>测试</h1>'
      + '<img src="__WECOM_BODY_IMAGE__" onerror="evil()"><a href="https://example.invalid/">原文</a></article>';
    const form = new FormData();
    form.set("title", "企微发布测试");
    form.set("html", new File([original], "whitepaper.html"));
    form.set("cover", new File([pngBytes], "cover.png"));
    form.append("images", new File([pngBytes], image.name));
    const draft = await parsePublicationDraft(form);
    expect(draft.originalHtml).toBe(original);
    expect(draft.article.html).toContain("data:font/woff2;base64,AA==");
    expect(draft.article.html).toContain("padding:0 22px");
    expect(draft.article.html).toContain(imageMarker(0));
    expect(draft.article.html).not.toMatch(/script|onerror|onclick/);
    const preview = publicationPreview(draft);
    expect(preview.html).toContain('src="data:image/png;base64,');
    expect(preview.html).not.toContain("https://example.invalid/");
    expect(preview.cover).toMatch(/^data:image\/png;base64,/);
  });

  it("maps separate files by basename and removes network-loading style rules", () => {
    const images = [image, { ...image, name: "second.png" }];
    const html = normalizePublicationHtml(
      '<style>@import "https://example.invalid/style";</style><p style="color:inherit">内容</p>'
        + '<img src="./assets/%E6%8F%92%E7%94%BB.png"><img src="second.png">',
      images,
    );
    expect(html).toContain(imageMarker(0));
    expect(html).toContain(imageMarker(1));
    expect(html).toContain("color:inherit");
    expect(html).not.toContain("example.invalid");
  });

  it("rejects missing, unused and remote images", () => {
    for (const html of ['<img src="missing.png">', '<p>正文</p>', '<img src="https://example.invalid/插画.png">']) {
      expect(() => normalizePublicationHtml(html, [image])).toThrow();
    }
    expect(() => normalizePublicationHtml("<p>" + imageMarker(0) + "</p>", [])).toThrow();
  });

  it("rejects an image with the wrong file signature", async () => {
    const form = new FormData();
    form.set("title", "测试");
    form.set("html", new File(["<p>内容</p>"], "article.html"));
    form.set("cover", new File(["not an image"], "cover.png", { type: "image/png" }));
    await expect(parsePublicationDraft(form)).rejects.toMatchObject({ status: 422 });
  });
});
