"use client";

import { MasonryGrid } from "@/components/layout/MasonryGrid";
import { FeatureCard } from "@/components/ui/FeatureCard";

const SAMPLE_CARDS = [
  {
    title: "云游胖东来",
    description: "深入胖东来的商业哲学，探索其如何在零售业中践行人文关怀与卓越治理。",
    date: "JAN 2026",
    imageUrl: "/pang-dong-lai.jpg"
  },
  {
    title: "其他案例待点亮",
    description: "更多深具文化基因与人文精神的企业案例即将来集。我们将一同在别人的灯火里，看见前行的方向。",
    date: "COMING SOON",
    imageUrl: ""
  },
];

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-12 pl-4">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 flex items-baseline gap-3">
          <span className="font-noto text-ink">镜鉴</span>
          <span className="font-serif text-amber italic text-3xl md:text-4xl opacity-90">Mirror</span>
        </h1>
        <p className="text-ink/60 max-w-2xl text-lg font-serif">
          在别人的灯火里看见基业长青的文化基因。
        </p>
      </div>

      <MasonryGrid>
        {SAMPLE_CARDS.map((card, i) => (
          <FeatureCard
            key={i}
            title={card.title}
            description={card.description}
            date={card.date}
            imageUrl={card.imageUrl}
            className="mb-6"
          />
        ))}
      </MasonryGrid>
    </div>
  );
}
