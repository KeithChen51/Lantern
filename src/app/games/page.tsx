import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@iconify/react";
import {
  LhCard,
  LhChip,
  LhEmptyState,
  LhPageHero,
  LhSectionHeader,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { isGamesModuleEnabled } from "@/config/features";
import { listGames } from "@/modules/games";

export default function GamesPage() {
  if (!isGamesModuleEnabled()) {
    notFound();
  }

  const games = listGames();

  return (
    <div className="space-y-8 pb-12">
      <LhPageHero
        eyebrow="启航"
        icon={<Icon icon={lighthouseIcons.arrowRightUp} className="h-4 w-4" />}
        title="把服务文化放回可参与的航程里。"
        description={
          <p>
            启航是承载文化相关互动游戏的板块。每个游戏把服务理念放回真实判断与选择中，在不可回退的航程、结果反馈与航迹复盘中，让“求真、尽善、致美、大爱”可被体验、可被检验。
          </p>
        }
        asideTitle="接入约定"
        asideItems={[
          { title: "可注册", description: "新游戏靠注册表条目接入，不改框架核心。" },
          { title: "服务端计分", description: "分数由权威逻辑重算，客户端不提交分数。" },
          { title: "统一身份与榜单", description: "留名与永久榜统一到主项目（待前置依赖落地）。" },
        ]}
      />

      <section className="space-y-6">
        <LhSectionHeader
          eyebrow="游戏目录"
          title="已上线的文化游戏"
          description="首发游戏“灯塔：服务文化之旅”将在其计分核心迁移、统一身份与永久榜落地后接入。"
        />

        {games.length === 0 ? (
          <LhEmptyState
            tone="neutral"
            icon={<Icon icon={lighthouseIcons.arrowRightUp} className="h-5 w-5" />}
            title="还没有游戏上线"
            description="板块框架已就位。首个文化游戏接入后，会在这里以可进入的卡片出现。"
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {games.map((game) => {
              const card = (
                <LhCard key={game.slug} className="grid min-h-[220px] grid-rows-[auto_1fr_auto] gap-4 p-6 transition-[border-color,box-shadow,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] hover:border-line-strong hover:shadow-lh-md">
                  <div className="flex items-start justify-between gap-4">
                    <LhChip tone={game.status === "published" ? "success" : "neutral"}>
                      {game.status}
                    </LhChip>
                    <span className="text-sm font-extrabold text-muted">{game.slug}</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold leading-tight text-ink">{game.title}</h2>
                    <p className="mt-3 text-base leading-8 text-ink-soft">{game.summary}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-4">
                    <span className="text-sm font-bold text-muted">启航内容卡</span>
                    {game.status === "published" ? (
                      <span className="inline-flex min-h-9 items-center justify-center rounded-sm border border-line-strong bg-panel px-3 text-xs font-bold text-primary-deep shadow-lh-sm">
                        进入游戏
                      </span>
                    ) : (
                      <span className="text-sm font-extrabold text-muted">未上线</span>
                    )}
                  </div>
                </LhCard>
              );

              return game.status === "published" && game.href ? (
                <Link key={game.slug} href={game.href} className="block">
                  {card}
                </Link>
              ) : (
                <div key={game.slug}>{card}</div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
