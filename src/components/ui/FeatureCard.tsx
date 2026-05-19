import { cn } from "@/lib/utils";
import Image from "next/image";
import { LhCard, LhChip } from "@/components/ui/lighthouse-primitives";

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
    <LhCard
      className={cn(
        "group grid min-h-[240px] overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-lh-md md:grid-cols-[minmax(0,1.16fr)_minmax(260px,0.84fr)]",
        className,
      )}
    >
      <div className="relative min-h-[190px] overflow-hidden bg-primary-soft md:min-h-full">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, 55vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
          />
        ) : (
          <div className="flex h-full min-h-[190px] items-center justify-center bg-surface-quiet text-sm font-bold text-primary-deep">
            案例资料
          </div>
        )}
      </div>

      <div className="grid min-w-0 grid-rows-[1fr_auto] gap-5 p-5">
        <div className="min-w-0 space-y-3">
          <LhChip tone="primary">{date}</LhChip>
          <h3 className="line-clamp-2 text-xl font-extrabold leading-tight text-ink transition-colors group-hover:text-primary-deep">
            {title}
          </h3>
          <p className="line-clamp-4 text-sm leading-7 text-muted">{description}</p>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-4 text-sm font-bold text-primary-deep">
          <span>查看案例</span>
          <span aria-hidden="true" className="h-px w-8 bg-primary transition-[width] duration-200 group-hover:w-12" />
        </div>
      </div>
    </LhCard>
  );
}
