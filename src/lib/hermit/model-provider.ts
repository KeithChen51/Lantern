import { createOpenAI } from "@ai-sdk/openai";

export type HermitModelApiMode = "chat" | "responses";

export type HermitProviderSettings = {
  apiKey: string;
  baseURL: string;
  apiMode: HermitModelApiMode;
  headers: Record<string, string>;
};

export type HermitModelFactory<TModel> = {
  chat(modelName: string): TModel;
  responses(modelName: string): TModel;
};

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL_API_MODE: HermitModelApiMode = "chat";
export const DEFAULT_HERMIT_CHAT_MODEL = "qwen3.6-plus";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeUrlPath(url: URL, pathname: string): string {
  url.pathname = pathname || "/";
  url.search = "";
  url.hash = "";
  return trimTrailingSlash(url.toString());
}

function normalizeHeaderName(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName === "authorization") return "Authorization";
  if (lowerName === "content-type") return "Content-Type";
  return name;
}

function stripEndpointSuffix(
  url: URL,
  cleanPath: string,
): { baseURL: string; apiMode: HermitModelApiMode } | null {
  if (cleanPath.endsWith("/chat/completions")) {
    return {
      baseURL: normalizeUrlPath(url, cleanPath.slice(0, -"/chat/completions".length)),
      apiMode: "chat",
    };
  }

  if (cleanPath.endsWith("/responses")) {
    return {
      baseURL: normalizeUrlPath(url, cleanPath.slice(0, -"/responses".length)),
      apiMode: "responses",
    };
  }

  return null;
}

function normalizeProviderBaseUrl(rawUrl: string): { baseURL: string; apiMode: HermitModelApiMode } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { baseURL: DEFAULT_OPENAI_BASE_URL, apiMode: DEFAULT_MODEL_API_MODE };
  }

  try {
    const url = new URL(trimmed);
    const cleanPath = url.pathname.replace(/\/+$/, "");
    const endpoint = stripEndpointSuffix(url, cleanPath);
    if (endpoint) {
      return endpoint;
    }

    if (!cleanPath || cleanPath === "/") {
      return { baseURL: normalizeUrlPath(url, "/v1"), apiMode: DEFAULT_MODEL_API_MODE };
    }

    url.search = "";
    url.hash = "";
    return { baseURL: trimTrailingSlash(url.toString()), apiMode: DEFAULT_MODEL_API_MODE };
  } catch {
    return { baseURL: trimmed, apiMode: DEFAULT_MODEL_API_MODE };
  }
}

export function readHermitModelName(value = process.env.OPENAI_MODEL): string {
  return value?.trim() || DEFAULT_HERMIT_CHAT_MODEL;
}

export function readHermitModelApiMode(
  value = process.env.OPENAI_API_MODE,
  fallback: HermitModelApiMode = DEFAULT_MODEL_API_MODE,
): HermitModelApiMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "responses") return "responses";
  if (normalized === "chat") return "chat";
  return fallback;
}

export function readHermitExtraHeaders(value = process.env.OPENAI_EXTRA_HEADERS): Record<string, string> {
  const trimmed = value?.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("OPENAI_EXTRA_HEADERS must be a JSON object with string values.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OPENAI_EXTRA_HEADERS must be a JSON object with string values.");
  }

  const headers: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(parsed)) {
    if (typeof headerValue !== "string") {
      throw new Error("OPENAI_EXTRA_HEADERS must be a JSON object with string values.");
    }
    const normalizedName = name.trim();
    const normalizedValue = headerValue.trim();
    if (normalizedName && normalizedValue) {
      headers[normalizeHeaderName(normalizedName)] = normalizedValue;
    }
  }
  return headers;
}

export function resolveHermitProviderSettings(
  env: Record<string, string | undefined> = process.env,
): HermitProviderSettings {
  const normalizedUrl = normalizeProviderBaseUrl(env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL);
  return {
    apiKey: env.OPENAI_API_KEY || "",
    baseURL: normalizedUrl.baseURL,
    apiMode: readHermitModelApiMode(env.OPENAI_API_MODE, normalizedUrl.apiMode),
    headers: readHermitExtraHeaders(env.OPENAI_EXTRA_HEADERS),
  };
}

export function selectHermitLanguageModel<TModel>(
  provider: HermitModelFactory<TModel>,
  modelName: string,
  apiMode = readHermitModelApiMode(),
) {
  return apiMode === "responses" ? provider.responses(modelName) : provider.chat(modelName);
}

export function createHermitProvider(settings = resolveHermitProviderSettings()) {
  return createOpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    headers: settings.headers,
  });
}
