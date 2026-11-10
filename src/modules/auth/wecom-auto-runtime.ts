import { prisma } from "@/infrastructure/db";
import { PrismaAccessStore } from "./access-store";
import { AccessError } from "./access-types";
import { readSiteAccessConfig } from "./site-access-config";
import { WecomAutoAccessService } from "./wecom-auto-access";
import { WecomAutoClient } from "./wecom-auto-client";
import { readWecomAutoConfig, type WecomAutoConfig } from "./wecom-auto-config";

let cached: { config: WecomAutoConfig; service: WecomAutoAccessService } | undefined;

export function getWecomAutoAccess(site = readSiteAccessConfig()) {
  const config = readWecomAutoConfig(site);
  if (!config) {
    cached = undefined;
    throw new AccessError("此环境未启用汽车企微登录。", 401);
  }
  if (!cached || cached.config.namespace !== config.namespace || cached.config.secret !== config.secret) {
    cached = { config, service: new WecomAutoAccessService(config, new WecomAutoClient(config), new PrismaAccessStore(prisma)) };
  }
  return cached;
}
