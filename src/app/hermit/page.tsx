"use client";

import { ChatPanel } from "@/components/hermit/ChatPanel";

export default function HermitPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-7xl mx-auto">
      {/* Minimal header */}
      <div className="flex-shrink-0 pt-4 pb-3 px-4">
        <h1 className="text-3xl md:text-4xl font-bold flex items-baseline gap-3">
          <span className="font-noto text-ink">路引</span>
          <span className="font-serif text-amber italic text-2xl md:text-3xl opacity-90">
            Hermit
          </span>
        </h1>
        <p className="mt-2 max-w-2xl font-serif text-sm leading-7 text-ink/55">
          把难判断的服务场景带回真、善、美、爱。路引不替代现场决策，而是帮助你辨析主维度与关联维度，找到更清楚的下一步。
        </p>
      </div>

      {/* Chat area takes remaining height */}
      <div className="flex-1 min-h-0">
        <ChatPanel />
      </div>
    </div>
  );
}
