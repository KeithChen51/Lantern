import { cn } from "@/lib/utils";

interface MasonryGridProps {
    children: React.ReactNode;
    className?: string;
}

export function MasonryGrid({ children, className }: MasonryGridProps) {
    return (
        <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-4", className)}>
            {children}
        </div>
    );
}
