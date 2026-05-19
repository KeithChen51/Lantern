"use client";

import { useChat } from "@ai-sdk/react";
import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { ChatInput } from "./ChatInput";
import { MessageBubble, TypingIndicator } from "./MessageBubble";
import { LhPanel, LhStatusBadge } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { cn } from "@/lib/utils";

const SUGGESTED_QUESTIONS = [
  "客户一直追问交车时间，但车间还没有最终结论，服务顾问应该怎么回应？",
  "一个案例里同时有真实告知、客户关怀和门店成本，主维度怎么判断？",
  "客户利益和员工承压发生冲突时，如何区分善和爱？",
  "如果证据不足，路引应该先向我追问哪些事实？",
];

export function ChatPanel() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;

  useEffect(() => {
    const element = scrollRef.current;
    if (element && (hasMessages || isLoading)) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }
  }, [hasMessages, isLoading, messages, status]);

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
    <LhPanel elevated className="grid w-full overflow-hidden border-line-strong bg-panel lg:h-[calc(100vh-104px)] lg:min-h-[620px] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="border-b border-line bg-[linear-gradient(180deg,var(--color-panel),var(--color-surface-quiet))] px-5 py-4 md:px-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-primary text-panel shadow-lh-sm">
              <Icon icon={lighthouseIcons.hermit} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="whitespace-nowrap text-xl font-extrabold leading-tight text-ink md:text-2xl">路引 AI 对话助手</h1>
                <LhStatusBadge tone="success">知识已接入</LhStatusBadge>
              </div>
              <p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-muted md:text-sm">
                直接描述服务场景，路引会按事实、判断依据和下一步话术来回应。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LhStatusBadge tone={isLoading ? "warning" : "success"}>{isLoading ? "生成中" : "可提问"}</LhStatusBadge>
            <span className="text-xs font-bold leading-5 text-muted">Enter 发送 · Shift + Enter 换行</span>
          </div>
        </div>
      </header>

      <main
        ref={scrollRef}
        className="min-h-0 overflow-y-auto bg-[linear-gradient(180deg,var(--color-panel),var(--color-surface)_62%,var(--color-surface-quiet))] px-4 py-6 md:px-6"
      >
        <div className="mx-auto grid max-w-4xl gap-5">
          {!hasMessages && <AssistantIntro />}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isLoading && messages[messages.length - 1]?.role !== "assistant" && <TypingIndicator />}
        </div>
      </main>

      <footer className="bg-surface-quiet px-4 py-4 md:px-6">
        <div className="mx-auto max-w-4xl">
          <ChatInput value={input} onChange={setInput} onSubmit={handleSubmit} isLoading={isLoading} />
          {!hasMessages && (
            <>
              <SuggestedQuestions onSelect={handleSuggestedQuestion} disabled={isLoading} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold leading-5 text-muted">
                <span>建议包含：客户状态、时间线、门店限制、已做动作。</span>
                <span>路引不替代现场责任与最终决策。</span>
              </div>
            </>
          )}
        </div>
      </footer>
    </LhPanel>
  );
}

function AssistantIntro() {
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col items-center px-3 py-8 text-center md:py-12">
      <span className="flex h-12 w-12 items-center justify-center rounded-sm bg-primary text-panel shadow-lh-sm">
        <Icon icon={lighthouseIcons.hermit} className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-2xl font-extrabold leading-tight text-ink">把服务场景直接发给路引</h2>
      <p className="mt-3 max-w-xl text-sm font-bold leading-7 text-ink-soft md:text-base md:leading-8">
        不需要先选模块。说明客户状态、限制条件和你卡住的判断，路引会按事实、维度、依据和下一步动作来回应。
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs font-extrabold text-muted">
        <span className="rounded-sm border border-line bg-surface px-2.5 py-1">可追问</span>
        <span className="rounded-sm border border-line bg-surface px-2.5 py-1">会标出证据不足</span>
        <span className="rounded-sm border border-line bg-surface px-2.5 py-1">输出可执行动作</span>
      </div>
    </article>
  );
}

function SuggestedQuestions({ onSelect, disabled }: { onSelect: (question: string) => void; disabled: boolean }) {
  return (
    <section className="mt-3" aria-label="推荐问题">
      <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-muted">
        <Icon icon={lighthouseIcons.send} className="h-3.5 w-3.5 text-primary" />
        推荐问题
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {SUGGESTED_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onSelect(question)}
            disabled={disabled}
            className={cn(
              "rounded-sm border border-transparent px-2 py-1.5 text-left text-xs font-bold leading-5 text-muted transition-[background,border-color,color] duration-150",
              "hover:border-line hover:bg-panel hover:text-primary-deep disabled:cursor-not-allowed disabled:opacity-55",
            )}
          >
            {question}
          </button>
        ))}
      </div>
    </section>
  );
}
