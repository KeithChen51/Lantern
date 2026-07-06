import Image from "next/image";
import { cn } from "@/lib/utils";
import { LhChip } from "@/components/ui/lighthouse-primitives";

interface FeatureCardProps {
  title: string;
  description: string;
  date: string;
  imageUrl?: string;
  className?: string;
}

export function FeatureCard({
  title,
  description,
  date,
  imageUrl,
  className,
}: FeatureCardProps) {
  return (
    <article
      className={cn(
        "group relative grid overflow-hidden rounded-[var(--lh-card-radius)] border border-line bg-surface text-ink shadow-[var(--lh-card-shadow)] transition-[border-color,box-shadow,transform] duration-[var(--lh-motion-medium)] ease-[var(--lh-ease-out)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--lh-card-hover-shadow)] md:aspect-[1.618/1] md:grid-cols-[61.8%_minmax(0,1fr)]",
        className,
      )}
    >
      <div className="relative min-h-[190px] overflow-hidden bg-primary-soft md:min-h-full">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, 60vw"
            className="object-cover transition-transform duration-[var(--lh-motion-medium)] ease-[var(--lh-ease-out)] group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full min-h-[190px] items-center justify-center bg-surface-quiet text-sm font-bold text-primary-deep">
            案例资料
          </div>
        )}
      </div>

      <div className="grid min-w-0 grid-rows-[1fr_auto] gap-4 p-5">
        <div className="min-w-0 space-y-3">
          <LhChip tone="primary">{date}</LhChip>
          <h3 className="line-clamp-2 text-lg font-extrabold leading-tight text-ink transition-colors group-hover:text-primary-deep">
            {title}
          </h3>
          <p className="line-clamp-4 text-sm leading-6 text-muted">{description}</p>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-3 text-xs font-bold uppercase tracking-[0.14em] text-primary-deep">
          <span>查看案例</span>
          <span aria-hidden="true" className="h-px w-12 origin-left scale-x-75 bg-primary transition-transform duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-out)] group-hover:scale-x-100" />
        </div>
      </div>
    </article>
  );
}
