import { cn } from "@/lib/utils";
import Image from "next/image";

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
        <div
            className={cn(
                "group relative aspect-[1.618/1] flex flex-row rounded-2xl bg-white/40 border border-white/50 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-500 hover:-translate-y-1 overflow-hidden backdrop-blur-[2px]",
                className
            )}
        >
            {/* Left Side: Image (Golden Ratio focus) */}
            <div className="relative w-[61.8%] h-full overflow-hidden bg-ink/5 shrink-0">
                {imageUrl ? (
                    <Image
                        src={imageUrl}
                        alt={title}
                        fill
                        sizes="(max-width: 768px) 100vw, 60vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-ink/10">
                        <span className="font-serif italic text-xs">Illuminating Case...</span>
                    </div>
                )}
            </div>

            {/* Right Side: Content (Golden Proportion) */}
            <div className="flex-1 p-5 flex flex-col justify-between overflow-hidden">
                <div className="space-y-2">
                    <h3 className="font-serif text-lg font-bold text-ink leading-tight group-hover:text-amber transition-colors line-clamp-2">
                        {title}
                    </h3>
                    <p className="text-[11px] text-ink/50 leading-relaxed font-sans">
                        {description}
                    </p>
                </div>

                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.2em] text-ink/30 font-medium pt-2 border-t border-ink/5">
                    <span>{date}</span>
                    <div className="w-6 h-[0.5px] bg-ink/10 group-hover:w-12 transition-all duration-500" />
                </div>
            </div>
        </div>
    );
}
