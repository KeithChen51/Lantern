import { cn } from "@/lib/utils";
import "../../../docs/design/brand-attribution/masks.css";
import "../../../docs/design/brand-attribution/signature.css";

interface BrandAttributionProps {
  layout?: "compact-horizontal" | "standard-stacked";
  tone?: "dark" | "light" | "amber";
  className?: string;
}

export function BrandAttribution({
  layout = "standard-stacked",
  tone = "dark",
  className,
}: BrandAttributionProps) {
  return (
    <span
      data-lh-brand-attribution
      data-layout={layout}
      data-tone={tone}
      role="img"
      aria-label="Powered by SPACE AI Native"
      className={cn("space-signature", layout === "compact-horizontal" && "space-signature--compact", className)}
    >
      <span className="space-signature__by" aria-hidden="true" />
      <span className="space-signature__mark" aria-hidden="true">
        <span className="space-signature__orbit-back" />
        <span className="space-signature__wordmark" />
        <span className="space-signature__focus" />
        <span className="space-signature__orbit-front" />
      </span>
      <span className="space-signature__descriptor" aria-hidden="true" />
    </span>
  );
}
