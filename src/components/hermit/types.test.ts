import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { formatHermitFileSize, getDocumentRecommendations, getHermitApiError, isSupportedHermitFile } from "./types";

describe("Hermit UI data helpers", () => {
  it("accepts the supported attachment formats and rejects legacy .doc", () => {
    expect(isSupportedHermitFile(new File(["%PDF"], "handover.pdf"))).toBe(true);
    expect(isSupportedHermitFile(new File(["# note"], "handover.md"))).toBe(true);
    expect(isSupportedHermitFile(new File(["legacy"], "handover.doc"))).toBe(false);
  });

  it("extracts document recommendations from streamed data parts", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "data-document",
          id: "document-part-1",
          data: {
            resourceId: "service-guide",
            versionId: "v3",
            title: "交车延期沟通指引",
            source: "灯塔知识中台",
            heading: "先确认客户最在意的时间点",
          },
        },
      ],
    } as unknown as UIMessage;

    expect(getDocumentRecommendations(message)).toEqual([
      {
        id: "document-part-1",
        resourceId: "service-guide",
        versionId: "v3",
        title: "交车延期沟通指引",
        source: "灯塔知识中台",
        heading: "先确认客户最在意的时间点",
      },
    ]);
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
