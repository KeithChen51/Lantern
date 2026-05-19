"use client";

import { useChat } from "@ai-sdk/react";
import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { ChatInput } from "./ChatInput";
import { MessageBubble, TypingIndicator } from "./MessageBubble";
import { LhChip, LhPanel, LhStatusBadge } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { cn } from "@/lib/utils";

const SUGGESTED_QUESTIONS = [
  "客户一直追问交车时间，但车间还没有最终结论，服务顾问应该怎么回应？",
  "一个案例里同时有真实告知、客户关怀和门店成本，主维度怎么判断？",
  "客户利益和员工承压发生冲突时，如何区分善和爱？",
  "如果证据不足，路引应该先向我追问哪些事实？",
];

const answerContract = [
  ["先补事实", "客户状态、时间线、门店限制和已做动作必须说清。"],
  ["再做判断", "区分主维度和关联维度，避免只给口号式建议。"],
  ["最后落行动", "给出一句可直接使用的回应或下一步动作。"],
];

const evidenceBlocks = [
  ["本心", "真、善、美、爱作为判断底座。"],
  ["镜鉴", "引用外部标杆和服务案例。"],
  ["共创", "转化为岗位应做与避免事项。"],
  ["证据不足", "事实缺口明确标出，不装作确定。"],
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
    <LhPanel elevated className="overflow-hidden lg:grid lg:h-[calc(100vh-112px)] lg:min-h-[560px] lg:grid-rows-[auto_minmax(0,1fr)]">
      <div className="grid border-b border-line bg-surface-quiet px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-line bg-panel text-primary shadow-lh-sm">
            <Icon icon={lighthouseIcons.hermit} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold leading-tight text-ink md:text-2xl">路引 AI 对话助手</h1>
              <LhStatusBadge tone="success">知识已接入</LhStatusBadge>
            </div>
            <p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-muted md:text-sm">
              把服务场景讲出来，路引会先回到事实，再进入价值判断和可执行动作。
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 md:mt-0 md:justify-end">
          <LhStatusBadge tone={isLoading ? "warning" : "success"}>{isLoading ? "生成中" : "可提问"}</LhStatusBadge>
          <LhChip tone="primary">场景事实</LhChip>
          <LhChip tone="primary">价值判断</LhChip>
          <LhChip tone="signal">下一步动作</LhChip>
        </div>
      </div>

      <div className="grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid min-h-[640px] grid-rows-[auto_minmax(0,1fr)_auto] border-line lg:min-h-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2.5 md:px-5">
            <div className="flex flex-wrap gap-2">
              <LhChip tone="primary">对话流</LhChip>
              <LhChip tone="neutral">回车发送</LhChip>
              <LhChip tone="neutral">Shift + 回车换行</LhChip>
            </div>
            <p className="text-xs font-bold leading-5 text-muted">建议先讲具体场景，再问判断分歧。</p>
          </div>

          <div
            ref={scrollRef}
            className="min-h-0 overflow-y-auto bg-[linear-gradient(180deg,rgba(215,236,239,0.28),transparent_160px)] px-4 py-4 md:px-5"
          >
            <div className="mx-auto grid max-w-5xl gap-4">
              <AssistantIntro />
              {!hasMessages && <StarterGrid onSelect={handleSuggestedQuestion} disabled={isLoading} />}
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && messages[messages.length - 1]?.role !== "assistant" && <TypingIndicator />}
            </div>
          </div>

          <div className="border-t border-line bg-surface-quiet p-3 md:p-4">
            <ChatInput value={input} onChange={setInput} onSubmit={handleSubmit} isLoading={isLoading} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold leading-5 text-muted">
              <span>建议包含：客户状态、时间线、门店限制、已做动作。</span>
              <span>路引不替代现场责任与最终决策。</span>
            </div>
          </div>
        </section>

        <aside className="grid content-start gap-4 border-t border-line bg-surface p-4 lg:min-h-0 lg:overflow-y-auto lg:border-t-0">
          <section className="rounded-md border border-line bg-panel p-3 shadow-lh-sm">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink">
              <Icon icon={lighthouseIcons.status} className="h-5 w-5 text-primary" />
              回答约定
            </h2>
            <div className="mt-3 grid gap-2">
              {answerContract.map(([title, text], index) => (
                <div key={title} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-sm border border-line bg-surface-quiet p-3">
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
          </section>

          <section className="rounded-md border border-line bg-panel p-3 shadow-lh-sm">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-ink">
              <Icon icon={lighthouseIcons.document} className="h-5 w-5 text-primary" />
              可引用依据
            </h2>
            <div className="mt-3 grid gap-2">
              {evidenceBlocks.map(([title, text]) => (
                <div key={title} className="rounded-sm border border-line bg-surface-quiet px-3 py-2">
                  <strong className="block text-sm font-extrabold text-ink">{title}</strong>
                  <span className="text-sm leading-6 text-muted">{text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-line bg-primary-soft p-3 text-primary-deep shadow-lh-sm">
            <h2 className="flex items-center gap-2 text-sm font-extrabold">
              <Icon icon={lighthouseIcons.info} className="h-4 w-4" />
              适合这样提问
            </h2>
            <p className="mt-2 text-sm font-bold leading-7">
              “客户在某个节点出现情绪，我已经做了哪些动作，现在卡在什么判断上。”
            </p>
          </section>
        </aside>
      </div>
    </LhPanel>
  );
}

function AssistantIntro() {
  return (
    <article className="grid grid-cols-[40px_minmax(0,1fr)] gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-primary text-panel shadow-lh-sm">
        <Icon icon={lighthouseIcons.hermit} className="h-5 w-5" />
      </span>
      <div className="min-w-0 rounded-md border border-line bg-panel p-4 shadow-lh-sm">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm font-extrabold text-ink">路引</strong>
          <LhStatusBadge tone="success" withDot={false}>
            AI 对话助手
          </LhStatusBadge>
        </div>
        <p className="mt-3 text-sm font-bold leading-7 text-ink-soft">
          把具体场景发给我。信息足够时，我会给出主维度、关联维度和下一步动作；信息不足时，我会先追问关键事实。
        </p>
      </div>
    </article>
  );
}

function StarterGrid({ onSelect, disabled }: { onSelect: (question: string) => void; disabled: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {SUGGESTED_QUESTIONS.map((question, index) => (
        <button
          key={question}
          type="button"
          onClick={() => onSelect(question)}
          disabled={disabled}
          className={cn(
            "group grid min-h-20 gap-2 rounded-md border border-line bg-surface px-4 py-3 text-left shadow-lh-sm transition-[background,border-color,transform,box-shadow] duration-150",
            "hover:-translate-y-0.5 hover:border-line-strong hover:bg-panel hover:shadow-lh-md disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-55",
          )}
        >
          <span className="flex items-center justify-between gap-3">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-sm border border-line bg-primary-soft text-xs font-extrabold text-primary-deep">
              {index + 1}
            </span>
            <Icon icon={lighthouseIcons.send} className="h-4 w-4 text-primary transition-transform duration-150 group-hover:translate-x-0.5" />
          </span>
          <span className="text-sm font-bold leading-6 text-ink-soft">{question}</span>
        </button>
      ))}
    </div>
  );
}
