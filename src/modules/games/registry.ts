import type { GameRegistryEntry } from "./types";

/**
 * 游戏注册表。
 *
 * 骨架阶段为空数组：板块、导航和搜索已经就位，但还没有任何游戏"上线"。
 * 首发游戏"灯塔：服务文化之旅"会在其 game-core 迁移、统一身份与 MySQL
 * leaderboard 落地后，作为第一条注册项追加于此。
 *
 * 追加示例：
 *   {
 *     slug: "voyage",
 *     title: "灯塔：服务文化之旅",
 *     summary: "以同行者身份带服务船穿过真实服务矛盾。",
 *     href: "/games/voyage",
 *     status: "published",
 *     scoringContract: "voyage-happiness-v1",
 *   }
 */
const GAME_REGISTRY: readonly GameRegistryEntry[] = [];

/** 返回所有已注册的文化游戏（按注册顺序）。骨架阶段返回空数组。 */
export function listGames(): readonly GameRegistryEntry[] {
  return GAME_REGISTRY;
}

/** 按 slug 查找一个注册游戏。 */
export function findGame(slug: string): GameRegistryEntry | null {
  return GAME_REGISTRY.find((entry) => entry.slug === slug) ?? null;
}
