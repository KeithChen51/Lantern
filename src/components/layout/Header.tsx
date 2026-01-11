"use client";

import { Search, Bell } from "lucide-react";

export function Header() {
    return (
        <header className="fixed top-0 left-0 right-0 h-20 pl-[80px] pr-8 flex items-center justify-between z-40 bg-gradient-to-b from-paper via-paper/80 to-transparent pointer-events-none">
            <div className="pointer-events-auto flex-1 flex justify-end gap-6 items-center max-w-7xl mx-auto w-full">
                {/* Search Bar */}
                <div className="relative group w-full max-w-md">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <Search className="w-4 h-4 text-ink/40 group-focus-within:text-ink transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full bg-ink/5 hover:bg-ink/10 focus:bg-white/50 border border-transparent focus:border-ink/10 rounded-full py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink/30 transition-all duration-300 outline-none shadow-sm backdrop-blur-sm"
                    />
                </div>

                {/* Actions */}
                <button className="p-2 rounded-full hover:bg-ink/5 text-ink/60 hover:text-ink transition-colors relative">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-red-400 rounded-full border-2 border-paper" />
                </button>
            </div>
        </header>
    );
}
