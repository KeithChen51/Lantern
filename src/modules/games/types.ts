/** 游戏目录契约。账号复用灯塔体系，玩法与计分由各游戏负责。 */
export type GameStatus = "draft" | "planned" | "published";

export type GameRegistryEntry = {
  slug: string;
  title: string;
  summary: string;
  genre: string;
  cover: { src: string; alt: string };
  /** 正式接入后填写，开发中的游戏不提供入口。 */
  href?: string;
  status: GameStatus;
  scoringContract?: string;
};
