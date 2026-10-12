import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { formatHermitFileSize, getAnswerSources, getDocumentRecommendations, getHermitApiError, getHermitCitationFromHref, getHermitCitations, getTextContent, isSupportedHermitFile } from "./types";

describe("Hermit UI data helpers", () => {
  it("accepts the supported attachment formats and rejects legacy .doc", () => {
    expect(isSupportedHermitFile(new File(["%PDF"], "handover.pdf"))).toBe(true);
    expect(isSupportedHermitFile(new File(["# note"], "handover.md"))).toBe(true);
    expect(isSupportedHermitFile(new File(["legacy"], "handover.doc"))).toBe(false);
  });

  it("uses only the completed answer-sources event for text, citations, and recommendations", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "text", text: "流式草稿。" },
        {
          type: "data-document",
          id: "document-part-1",
          data: {
            resourceId: "legacy-guide",
            versionId: "legacy-v1",
            title: "不应自动显示",
            source: "灯塔知识中台",
          },
        },
        {
          type: "data-answer-sources",
          data: {
            status: "complete",
            text: "请先确认事实 [1](#hermit-citation-1)。",
            citations: [
              { number: 1, resourceId: "service-guide", versionId: "v3", title: "交车延期沟通指引", source: "灯塔知识中台", startLine: 8, endLine: 10 },
              { number: 1, resourceId: "duplicate", versionId: "v1", title: "重复引用", source: "灯塔知识中台" },
              { number: 2, resourceId: "bad", versionId: "v1", title: "无效行号", source: "灯塔知识中台", startLine: 0 },
            ],
            recommendations: [
              { resourceId: "service-guide", versionId: "v3", title: "交车延期沟通指引", source: "灯塔知识中台", reason: "补充确认客户预期的具体话术。" },
              { resourceId: "service-guide", versionId: "v3", title: "重复推荐", source: "灯塔知识中台", reason: "重复项应合并。" },
              { resourceId: "missing-reason", versionId: "v1", title: "没有理由", source: "灯塔知识中台" },
            ],
          },
        },
      ],
    } as unknown as UIMessage;

    expect(getTextContent(message)).toBe("请先确认事实 [1](#hermit-citation-1)。");
    expect(getHermitCitations(message)).toEqual([
      { number: 1, resourceId: "service-guide", versionId: "v3", title: "交车延期沟通指引", source: "灯塔知识中台", startLine: 8, endLine: 10 },
    ]);
    expect(getDocumentRecommendations(message)).toEqual([
      {
        id: "recommendation:service-guide:v3",
        resourceId: "service-guide",
        versionId: "v3",
        title: "交车延期沟通指引",
        source: "灯塔知识中台",
        reason: "补充确认客户预期的具体话术。",
      },
    ]);
    expect(getHermitCitationFromHref("#hermit-citation-1", getHermitCitations(message))?.resourceId).toBe("service-guide");
    expect(getHermitCitationFromHref("#hermit-citation-9", getHermitCitations(message))).toBeNull();
    expect(getHermitCitationFromHref("#hermit-citation-1-extra", getHermitCitations(message))).toBeNull();
    expect(getHermitCitationFromHref("https://example.com", getHermitCitations(message))).toBeNull();
    expect(getAnswerSources(message)?.status).toBe("complete");
  });

  it("falls back to streamed text when the final event is absent or incomplete", () => {
    const message = {
      id: "assistant-2",
      role: "assistant",
      parts: [
        { type: "text", text: "流式回答。" },
        { type: "data-answer-sources", data: { status: "streaming", text: "不应使用", citations: [], recommendations: [] } },
      ],
    } as unknown as UIMessage;

    expect(getTextContent(message)).toBe("流式回答。");
    expect(getAnswerSources(message)).toBeNull();
  });

  it("formats attachment sizes for compact chips", () => {
    expect(formatHermitFileSize(512)).toBe("512 B");
    expect(formatHermitFileSize(2048)).toBe("2 KB");
    expect(formatHermitFileSize(1024 * 1024 * 2)).toBe("2.0 MB");
  });

  it("keeps actionable file errors while hiding runtime details", () => {
    expect(getHermitApiError({ error: "扫描版 PDF 暂不支持，请重新上传可读取的文档。" }, "通用错误")).toContain("扫描版 PDF");
    expect(getHermitApiError({ error: "DeepSeek stack trace at provider" }, "通用错误")).toBe("通用错误");
  });
});
