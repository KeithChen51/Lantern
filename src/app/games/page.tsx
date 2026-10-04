import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LhEmptyState } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { Icon } from "@iconify/react";
import { PageHeading } from "@/components/ui/PageHeading";
import { isGamesModuleEnabled } from "@/config/features";
import { listGames } from "@/modules/games";
import styles from "../mirror/content-v3.module.css";

export default function GamesPage() {
  if (!isGamesModuleEnabled()) notFound();
  const games = listGames();

  return (
    <div data-lh-page="games" data-lh-page-archetype="cultural-reading" className={styles.page}>
      <div className={styles.stack}>
        <PageHeading title="启航" description="在选择与经营中，体验服务的意义。" />

        {games.length === 0 ? (
          <LhEmptyState
            tone="neutral"
            icon={<Icon icon={lighthouseIcons.games} className="h-5 w-5" />}
            title="新的体验正在准备中"
            description="文化游戏将在这里与你见面。"
          />
        ) : (
          <div className={styles.gameGrid} aria-label="文化游戏目录">
            {games.map((game) => {
              const available = game.status === "published" && Boolean(game.href);
              const card = (
                <div className={styles.gameCard}>
                  <div className={styles.gameCover}>
                    <Image
                      src={game.cover.src}
                      alt={game.cover.alt}
                      fill
                      sizes="(max-width: 820px) 100vw, 560px"
                      className="object-cover"
                    />
                  </div>
                  <div className={styles.gameBody}>
                    <span className={styles.gameStatus}>{available ? "已上线" : "开发中"}</span>
                    <p className={styles.gameGenre}>{game.genre}</p>
                    <h2 className={styles.gameTitle}>{game.title}</h2>
                    <p className={styles.gameDescription}>{game.summary}</p>
                    <p className={styles.gameFooter}>{available ? "进入游戏" : "敬请期待 · 暂未开放体验"}</p>
                  </div>
                </div>
              );

              return available && game.href ? (
                <Link key={game.slug} href={game.href} className="block">
                  {card}
                </Link>
              ) : (
                <article key={game.slug}>{card}</article>
              );
            })}
          </div>
        )}

        <p className={styles.note}>封面为游戏概念插画，实际内容以正式开放版本为准。</p>
      </div>
    </div>
  );
}
