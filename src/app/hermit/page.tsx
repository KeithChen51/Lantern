"use client";

import { ChatPanel } from "@/components/hermit/ChatPanel";

export default function HermitPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-7xl mx-auto">
      {/* Minimal header */}
      <div className="flex-shrink-0 pt-4 pb-2 pl-4">
        <h1 className="text-3xl md:text-4xl font-bold flex items-baseline gap-3">
          <span className="font-noto text-ink">路引</span>
          <span className="font-serif text-amber italic text-2xl md:text-3xl opacity-90">
            Hermit
          </span>
        </h1>
      </div>

      {/* Chat area takes remaining height */}
      <div className="flex-1 min-h-0">
        <ChatPanel />
      </div>
    </div>
  );
}
