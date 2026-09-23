import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@iconify/react";
import { LhCard, LhChip, LhEmptyState } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { isGamesModuleEnabled } from "@/config/features";
import { listGames } from "@/modules/games";

export default function GamesPage() {
  if (!isGamesModuleEnabled()) notFound();
  const games = listGames();

  return (
    <div className="space-y-8 pb-12">
      <header className="space-y-4 pt-5 md:pt-7">
        <LhChip tone="primary">
          <Icon icon={lighthouseIcons.games} className="h-4 w-4" />
          启航 · 文化游戏
        </LhChip>
        <h1 data-lh-page-title className="text-[length:var(--title-page)] font-[var(--weight-black)] leading-[1.2] text-ink">
          在选择与经营中，体验服务的意义。
        </h1>
        <p className="max-w-3xl text-[length:var(--type-reading)] leading-[var(--leading-reading)] text-ink-soft">
          一段驶向灯塔的航程，一间用心经营的服务店。两款互动游戏正在开发中，期待与你相遇。
        </p>
      </header>
      <section aria-label="文化游戏目录" className="space-y-5">
        {games.length === 0 ? (
          <LhEmptyState tone="neutral" icon={<Icon icon={lighthouseIcons.games} className="h-5 w-5" />}
            title="新的体验正在准备中" description="文化游戏将在这里与你见面。" />
        ) : (
          <div className="grid items-stretch gap-6 md:grid-cols-2">
            {games.map((game) => {
              const available = game.status === "published" && Boolean(game.href);
              const card = (
                <LhCard className="flex h-full flex-col">
                  <div className="relative aspect-[3/2] overflow-hidden border-b border-line bg-surface-quiet">
                    <Image src={game.cover.src} alt={game.cover.alt} fill
                      sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 600px"
                      className="object-cover" />
                    <div className="absolute left-4 top-4 rounded-[var(--lh-control-radius)] bg-panel shadow-lh-sm">
                      <LhChip tone={available ? "success" : "neutral"}>
                        {available ? "已上线" : "开发中"}
                      </LhChip>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-5 md:p-6">
                    <p className="text-[length:var(--type-caption)] font-[var(--weight-extrabold)] leading-[var(--leading-caption)] text-primary-text">{game.genre}</p>
                    <h2 className="text-[length:var(--title-section)] font-[var(--weight-black)] leading-[1.3] text-ink">{game.title}</h2>
                    <p className="flex-1 text-[length:var(--type-body)] leading-[var(--leading-body)] text-ink-soft">{game.summary}</p>
                    <div className="mt-2 flex items-center gap-2 border-t border-line pt-4 text-[length:var(--type-caption)] leading-[var(--leading-caption)] text-muted">
                      <Icon icon={available ? lighthouseIcons.games : lighthouseIcons.clock} className="h-4 w-4 shrink-0" />
                      <span>{available ? "进入游戏" : "敬请期待 · 暂未开放体验"}</span>
                    </div>
                  </div>
                </LhCard>
              );
              return (
                <article key={game.slug}>
                  {available && game.href ? (
                    <Link href={game.href} className="block h-full rounded-[var(--lh-card-radius)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{card}</Link>
                  ) : card}
                </article>
              );
            })}
          </div>
        )}
        <p className="text-[length:var(--type-caption)] leading-[var(--leading-caption)] text-muted">
          封面为游戏概念插画，实际内容以正式开放版本为准。
        </p>
      </section>
    </div>
  );
}
