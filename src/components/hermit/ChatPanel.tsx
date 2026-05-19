"use client";

import { useChat } from "@ai-sdk/react";
import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { ChatInput } from "./ChatInput";
import { MessageBubble, TypingIndicator } from "./MessageBubble";
import { LhButton, LhCard, LhChip, LhPanel, LhSectionHeader } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

const SUGGESTED_QUESTIONS = [
  "客户一直追问交车时间，但车间还没有最终结论，服务顾问应该怎么回应？",
  "一个案例里同时有真实告知、客户关怀和门店成本，主维度怎么判断？",
  "客户利益和员工承压发生冲突时，如何区分善和爱？",
  "如果证据不足，路引应该先向我追问哪些事实？",
];

const answerContract = [
  ["直接判断", "先给主维度和关联维度"],
  ["判断依据", "引用事实、价值观或相关知识"],
  ["下一步", "给出一个可执行动作"],
];

const evidenceBlocks = [
  ["服务响应原则", "先承接情绪，再进入解释和承诺。"],
  ["等待场景 Do", "明确时间节点，主动更新，不让客户追问。"],
  ["证据不足", "缺少事实时先补来源，不装作确定。"],
];

export function ChatPanel() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }
  }, [messages, status]);

  function handleSubmit() {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");
    sendMessage({ text });
  }

  function handleSuggestedQuestion(question: string) {
    if (isLoading) return;
    setInput("");
    sendMessage({ text: question });
  }

  return (
    <LhPanel className="grid min-h-[680px] overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="grid min-h-[680px] grid-rows-[minmax(0,1fr)_auto] border-line lg:border-r">
        <div ref={scrollRef} className="min-h-0 overflow-y-auto p-4 md:p-6">
          {!hasMessages ? (
            <WelcomeState onSelect={handleSuggestedQuestion} disabled={isLoading} />
          ) : (
            <div className="mx-auto grid max-w-4xl gap-5">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && messages[messages.length - 1]?.role !== "assistant" && <TypingIndicator />}
            </div>
          )}
        </div>

        <div className="border-t border-line bg-surface-quiet p-4 md:p-5">
          <ChatInput value={input} onChange={setInput} onSubmit={handleSubmit} isLoading={isLoading} />
          <p className="mt-3 text-center text-xs font-bold leading-5 text-muted">
            路引提供价值辨析与思考引导，不替代现场责任与最终决策。
          </p>
        </div>
      </section>

      <aside className="grid gap-5 border-t border-line bg-surface-quiet p-5 lg:border-t-0">
        <LhSectionHeader
          eyebrow="Answer Contract"
          title="回答结构"
          description="Hermit 的回答应当帮助用户判断，而不是只给泛泛建议。"
        />
        <div className="grid gap-3">
          {answerContract.map(([title, text], index) => (
            <div key={title} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-sm border border-line bg-panel p-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-sm border border-line bg-primary-soft text-sm font-extrabold text-primary-deep">
                {index + 1}
              </span>
              <span>
                <strong className="block text-sm font-extrabold text-ink">{title}</strong>
                <span className="text-sm leading-6 text-muted">{text}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-line bg-panel p-4">
          <h3 className="flex items-center gap-2 text-lg font-extrabold text-ink">
            <Icon icon={lighthouseIcons.document} className="h-5 w-5 text-primary" />
            引用证据
          </h3>
          <div className="mt-4 grid gap-3">
            {evidenceBlocks.map(([title, text]) => (
              <div key={title} className="rounded-sm border-l-4 border-primary bg-surface-quiet px-3 py-2">
                <strong className="block text-sm font-extrabold text-ink">{title}</strong>
                <span className="text-sm leading-6 text-muted">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </LhPanel>
  );
}

function WelcomeState({ onSelect, disabled }: { onSelect: (question: string) => void; disabled: boolean }) {
  return (
    <div className="mx-auto grid h-full max-w-4xl content-center gap-6 py-10">
      <div className="max-w-2xl">
        <LhChip tone="signal">
          <Icon icon={lighthouseIcons.hermit} className="h-4 w-4" />
          Interpretation Mode
        </LhChip>
        <h2 className="mt-4 text-3xl font-extrabold leading-tight text-ink md:text-4xl">先把问题讲清楚，再进入价值判断。</h2>
        <p className="mt-4 text-base leading-8 text-ink-soft">
          你可以直接描述一个服务场景。路引会先回到事实，再辨析真、善、美、爱中的主维度和关联维度；如果证据不足，它会说明还缺少哪些事实。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SUGGESTED_QUESTIONS.map((question) => (
          <LhCard key={question} className="grid gap-4 p-4">
            <p className="text-sm font-bold leading-7 text-ink-soft">{question}</p>
            <LhButton
              type="button"
              variant="quiet"
              size="sm"
              icon={<Icon icon={lighthouseIcons.send} className="h-4 w-4" />}
              onClick={() => onSelect(question)}
              disabled={disabled}
              className="w-fit"
            >
              发送给路引
            </LhButton>
          </LhCard>
        ))}
      </div>
    </div>
  );
}
