import type { ChannelInfo, PublicationChannel } from "./contracts";

export type GroupPublicationConfiguration = { kind: "group"; baseUrl: string; appId: string; appKey: string };
export type AutoPublicationConfiguration = { kind: "auto"; corpId: string; agentId: number; secret: string };
export type PublicationConfiguration = GroupPublicationConfiguration | AutoPublicationConfiguration;

export function publicationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WECOM_PUBLISHING_ENABLED === "true";
}

function value(env: NodeJS.ProcessEnv, name: string, maximum = 512): string {
  const result = env[name];
  if (!result || result !== result.trim() || result.length > maximum || /[\u0000-\u001f\u007f-\u009f]/.test(result)) {
    throw new Error("企微发布通道配置不完整或无效。");
  }
  return result;
}

export function readPublicationConfiguration(id: PublicationChannel, env: NodeJS.ProcessEnv = process.env): PublicationConfiguration {
  if (!publicationEnabled(env)) throw new Error("企微发布尚未启用。");
  if (id === "group") {
    const base = new URL(value(env, "WECOM_PUBLISHING_GROUP_BASE_URL", 2048));
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
      throw new Error("企微发布通道配置不完整或无效。");
    }
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    return {
      kind: "group", baseUrl: base.href,
      appId: value(env, "WECOM_PUBLISHING_GROUP_APP_ID", 128),
      appKey: value(env, "WECOM_PUBLISHING_GROUP_APP_KEY", 2048),
    };
  }
  if (id !== "auto") throw new Error("未知企微发布通道。");
  const agent = value(env, "WECOM_PUBLISHING_AUTO_AGENT_ID", 16);
  const corpId = value(env, "WECOM_PUBLISHING_AUTO_CORP_ID", 128);
  if (!/^[1-9]\d*$/.test(agent) || !Number.isSafeInteger(Number(agent)) || !/^[A-Za-z0-9_-]+$/.test(corpId)) {
    throw new Error("企微发布通道配置不完整或无效。");
  }
  return { kind: "auto", agentId: Number(agent), corpId, secret: value(env, "WECOM_PUBLISHING_AUTO_SECRET") };
}

export function getPublicationChannelInfo(env: NodeJS.ProcessEnv = process.env): ChannelInfo[] {
  if (!publicationEnabled(env)) return [];
  const channels: ChannelInfo[] = [];
  for (const id of ["group", "auto"] as const) {
    try {
      readPublicationConfiguration(id, env);
      const labelName = id === "group" ? "WECOM_PUBLISHING_GROUP_LABEL" : "WECOM_PUBLISHING_AUTO_LABEL";
      const label = env[labelName] ? value(env, labelName, 60) : id === "group" ? "集团企微" : "汽车企微";
      channels.push({ id, label, coverLimit: (id === "group" ? 2 : 10) * 1024 * 1024, bodyImageLimit: 2 * 1024 * 1024 });
    } catch {
      // A partially configured application must never appear as a send target.
    }
  }
  return channels;
}
