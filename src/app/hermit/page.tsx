"use client";

import { Icon } from "@iconify/react";
import { ChatPanel } from "@/components/hermit/ChatPanel";
import { LhChip, LhPanel } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

const guidePoints = [
  ["事实", "先看客户、门店、规则和时间线是否清楚。"],
  ["处境", "再看客户压力、员工承压和现场限制。"],
  ["选择", "最后把可执行动作和风险说清楚。"],
];

export default function HermitPage() {
  return (
    <div className="mx-auto grid min-h-[calc(100vh-104px)] w-full max-w-7xl gap-6">
      <LhPanel className="overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-8">
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap gap-2">
              <LhChip tone="primary">
                <Icon icon={lighthouseIcons.hermit} className="h-4 w-4" />
                Hermit / 路引
              </LhChip>
              <LhChip tone="signal">Service Culture Assistant</LhChip>
            </div>
            <h1 className="max-w-4xl text-4xl font-extrabold leading-tight text-ink md:text-5xl">
              把难判断的服务场景，带回事实、处境和下一步。
            </h1>
            <p className="mt-5 max-w-4xl text-base leading-8 text-ink-soft md:text-lg">
              路引不是通用聊天，也不替代现场责任。它帮助你辨析主维度与关联维度，引用本心、案例和共创内容，最后落到一个可执行动作。
            </p>
          </div>

          <div className="grid gap-3 rounded-md border border-line bg-surface-quiet p-4">
            {guidePoints.map(([title, text], index) => (
              <div key={title} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-panel text-sm font-extrabold text-primary">
                  {index + 1}
                </span>
                <span>
                  <strong className="block text-sm font-extrabold text-ink">{title}</strong>
                  <span className="text-sm leading-6 text-muted">{text}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-line bg-surface-quiet px-6 py-4 text-sm font-bold leading-6 text-muted lg:px-8">
          <Icon icon={lighthouseIcons.info} className="mr-2 inline h-4 w-4 text-primary" />
          建议问题包含：场景事实、客户状态、门店限制、已有动作和希望判断的分歧。
        </div>
      </LhPanel>

      <ChatPanel />
    </div>
  );
}
