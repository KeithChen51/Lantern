import { describe, expect, it } from "vitest";
import {
  DEFAULT_HERMIT_CHAT_MODEL,
  readHermitExtraHeaders,
  readHermitModelApiMode,
  readHermitModelName,
  resolveHermitProviderSettings,
  selectHermitLanguageModel,
} from "./model-provider";

describe("hermit model provider", () => {
  it("defaults to the single preset group-procured chat model", () => {
    expect(readHermitModelName(undefined)).toBe(DEFAULT_HERMIT_CHAT_MODEL);
    expect(readHermitModelName("  ")).toBe(DEFAULT_HERMIT_CHAT_MODEL);
    expect(readHermitModelName("company-final-model")).toBe("company-final-model");
  });

  it("defaults to chat-completions mode for internal OpenAI-compatible gateways", () => {
    expect(readHermitModelApiMode(undefined)).toBe("chat");
    expect(readHermitModelApiMode("")).toBe("chat");
    expect(readHermitModelApiMode("unknown")).toBe("chat");
  });

  it("allows responses mode when explicitly configured", () => {
    expect(readHermitModelApiMode("responses")).toBe("responses");
    expect(readHermitModelApiMode(" RESPONSES ")).toBe("responses");
  });

  it("normalizes a gateway root URL to the v1 OpenAI-compatible base URL", () => {
    expect(
      resolveHermitProviderSettings({
        OPENAI_BASE_URL: "https://llm.example.com/",
      }),
    ).toMatchObject({
      baseURL: "https://llm.example.com/v1",
      apiMode: "chat",
    });
  });

  it("normalizes a full chat-completions endpoint to the provider base URL", () => {
    expect(
      resolveHermitProviderSettings({
        OPENAI_BASE_URL: "https://llm.example.com/v1/chat/completions",
      }),
    ).toMatchObject({
      baseURL: "https://llm.example.com/v1",
      apiMode: "chat",
    });

    expect(
      resolveHermitProviderSettings({
        OPENAI_BASE_URL: "https://llm.example.com/group/chat/completions",
      }),
    ).toMatchObject({
      baseURL: "https://llm.example.com/group",
      apiMode: "chat",
    });
  });

  it("infers responses mode from a full responses endpoint unless explicitly overridden", () => {
    expect(
      resolveHermitProviderSettings({
        OPENAI_BASE_URL: "https://llm.example.com/v1/responses",
      }),
    ).toMatchObject({
      baseURL: "https://llm.example.com/v1",
      apiMode: "responses",
    });

    expect(
      resolveHermitProviderSettings({
        OPENAI_BASE_URL: "https://llm.example.com/v1/responses",
        OPENAI_API_MODE: "chat",
      }),
    ).toMatchObject({
      baseURL: "https://llm.example.com/v1",
      apiMode: "chat",
    });
  });

  it("reads optional JSON extra headers for non-standard gateway auth", () => {
    expect(readHermitExtraHeaders(undefined)).toEqual({});
    expect(readHermitExtraHeaders('{ "X-Api-Key": " token ", "authorization": "Bearer custom" }')).toEqual({
      "X-Api-Key": "token",
      Authorization: "Bearer custom",
    });
  });

  it("selects the configured model endpoint", () => {
    const provider = {
      chat: (modelName: string) => ({ endpoint: "chat", modelName }),
      responses: (modelName: string) => ({ endpoint: "responses", modelName }),
    };

    expect(selectHermitLanguageModel(provider, "company-chat-model", "chat")).toEqual({
      endpoint: "chat",
      modelName: "company-chat-model",
    });
    expect(selectHermitLanguageModel(provider, "company-responses-model", "responses")).toEqual({
      endpoint: "responses",
      modelName: "company-responses-model",
    });
  });
});
