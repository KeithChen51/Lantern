import type { GameRegistryEntry } from "./types";

// 预告阶段不提供游戏入口。正式接入时统一复用灯塔账号体系。
const GAME_REGISTRY: readonly GameRegistryEntry[] = [
  {
    slug: "voyage",
    title: "灯塔：服务文化之旅",
    summary: "与同行者一起驶向灯塔。在真实的服务困境中作出选择，沿着航迹回看每一次判断。",
    genre: "情境选择 · 航程探索",
    status: "planned",
    cover: {
      src: "/images/games/service-voyage.webp",
      alt: "概念插画：同行者乘船穿过海湾，驶向夕阳中的灯塔",
    },
  },
  {
    slug: "service-store",
    title: "精诚服务店",
    summary: "从一间服务店开始，在出牌、接待与经营取舍中照顾客户，也让每一份信任慢慢积累。",
    genre: "卡牌策略 · 门店经营",
    status: "planned",
    cover: {
      src: "/images/games/service-store.webp",
      alt: "概念插画：汽车服务店内，服务顾问接待客户，技师检查车辆，桌上放着经营卡牌",
    },
  },
];

export function listGames(): readonly GameRegistryEntry[] {
  return GAME_REGISTRY;
}

export function findGame(slug: string): GameRegistryEntry | null {
  return GAME_REGISTRY.find((entry) => entry.slug === slug) ?? null;
}
