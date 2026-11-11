import { prisma } from "@/infrastructure/db";
import { PrismaAccessStore } from "./access-store";
import { AccessError, type Principal } from "./access-types";
import { readSiteAccessConfig } from "./site-access-config";
import { WecomAutoAccessService } from "./wecom-auto-access";
import { WecomAutoClient } from "./wecom-auto-client";
import { readWecomAutoConfig, type WecomAutoConfig } from "./wecom-auto-config";

let cached: { config: WecomAutoConfig; client: WecomAutoClient; service: WecomAutoAccessService } | undefined;

export function getWecomAutoAccess(site = readSiteAccessConfig()) {
  const config = readWecomAutoConfig(site);
  if (!config) {
    cached = undefined;
    throw new AccessError("此环境未启用汽车企微登录。", 401);
  }
  if (!cached || cached.config.namespace !== config.namespace || cached.config.secret !== config.secret
    || cached.config.entries.workbench !== config.entries.workbench || cached.config.entries.scan !== config.entries.scan) {
    const client = new WecomAutoClient(config);
    cached = { config, client, service: new WecomAutoAccessService(config, client, new PrismaAccessStore(prisma)) };
  }
  return cached;
}

export async function readWecomAutoOrganization(principal: Principal): Promise<string | undefined> {
  if (principal.kind !== "dealer" || principal.channel !== "web") return undefined;
  try {
    return await getWecomAutoAccess().client.readOrganization(principal.account);
  } catch {
    return undefined;
  }
}
