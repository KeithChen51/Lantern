import Link from "next/link";
import { MasonryGrid } from "@/components/layout/MasonryGrid";
import { FeatureCard } from "@/components/ui/FeatureCard";

const SAMPLE_CARDS = [
  {
    title: "云游胖东来",
    description: "深入胖东来的商业哲学，探索其如何在零售业中践行人文关怀与卓越治理。",
    date: "JAN 2026",
    imageUrl: "/pang-dong-lai.jpg",
    href: "/mirror/pang-dong-lai",
  },
  {
    title: "其他案例待点亮",
    description: "更多深具文化基因与人文精神的企业案例将陆续集结。我们将一同在别人的灯火里，看见前行的方向。",
    date: "COMING SOON",
    imageUrl: "",
    href: null,
  },
];

export default function MirrorPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-12 pl-4">
        <h1 className="mb-4 flex items-baseline gap-3 text-4xl font-bold md:text-5xl">
          <span className="font-noto text-ink">镜鉴</span>
          <span className="font-serif text-3xl italic text-amber opacity-90 md:text-4xl">Mirror</span>
        </h1>
        <p className="max-w-2xl font-serif text-lg text-ink/60">
          在别人的灯火里看见基业长青的文化基因。
        </p>
      </div>

      <MasonryGrid>
        {SAMPLE_CARDS.map((card) =>
          card.href ? (
            <Link key={card.title} href={card.href} className="block">
              <FeatureCard
                title={card.title}
                description={card.description}
                date={card.date}
                imageUrl={card.imageUrl}
              />
            </Link>
          ) : (
            <FeatureCard
              key={card.title}
              title={card.title}
              description={card.description}
              date={card.date}
              imageUrl={card.imageUrl}
            />
          ),
        )}
      </MasonryGrid>
    </div>
  );
}
