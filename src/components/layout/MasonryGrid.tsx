import { cn } from "@/lib/utils";

interface MasonryGridProps {
    children: React.ReactNode;
    className?: string;
}

export function MasonryGrid({ children }: { children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-4">
            {children}
        </div>
    );
}
