/**
 * Games 模块 —— 可注册、可扩展的文化游戏容器（骨架）。
 *
 * 本文件只定义"一个文化游戏如何被注册进主项目"的契约形状，
 * 不包含计分、身份或榜单实现。这些是后续接入时的前置依赖：
 *   - 统一玩家身份（src/modules/auth）
 *   - 通用 leaderboard 模型（prisma/schema）
 *   - 首发游戏 game-core 的等价迁移（案例 / 路线 / 状态机 / 服务端计分）
 *
 * 当一个新游戏要接入时，在 registry.ts 里追加一个 GameRegistryEntry 即可，
 * 无需改动框架核心。
 */

/** 游戏当前生命周期状态。骨架阶段统一为 draft / planned，不暴露发布逻辑。 */
export type GameStatus = "draft" | "planned" | "published";

/** 一个文化游戏在主项目里的注册条目。 */
export type GameRegistryEntry = {
  /** 稳定 slug，用于路由与榜单维度键。 */
  slug: string;
  /** 面向用户的中文标题。 */
  title: string;
  /** 一句话摘要。 */
  summary: string;
  /** 入口路径，例如 /games/voyage。骨架阶段可不落真实页面。 */
  href: string;
  /** 生命周期状态。 */
  status: GameStatus;
  /** 计分契约的稳定标识；正式接入后由 game-core 提供服务端重算逻辑。 */
  scoringContract?: string;
};
