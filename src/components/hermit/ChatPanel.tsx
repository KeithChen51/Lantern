"use client";

import { useChat } from "@ai-sdk/react";
import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { ChatInput } from "./ChatInput";
import { MessageBubble, TypingIndicator } from "./MessageBubble";
import {
  LhChatFooter,
  LhChatHeader,
  LhChatMain,
  LhChatShell,
  LhStatusBadge,
  LhSuggestionList,
} from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

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
    <LhChatShell data-lh-hermit-panel>
      <LhChatHeader data-lh-hermit-panel-header>
        <div data-lh-chat-header-layout>
          <div data-lh-chat-header-title-row>
            <span data-lh-chat-header-icon>
              <Icon icon={lighthouseIcons.hermit} />
            </span>
            <div data-lh-chat-header-copy>
              <div data-lh-chat-title-row>
                <h1 data-lh-chat-title>路引 AI 对话助手</h1>
                <LhStatusBadge tone="success">知识已接入</LhStatusBadge>
              </div>
              <p data-lh-chat-description>
                直接描述服务场景，路引会按事实、判断依据和下一步话术来回应。
              </p>
            </div>
          </div>
          <div data-lh-chat-header-status>
            <LhStatusBadge tone={isLoading ? "warning" : "success"}>{isLoading ? "生成中" : "可提问"}</LhStatusBadge>
            <span>Enter 发送 · Shift + Enter 换行</span>
          </div>
        </div>
      </LhChatHeader>

      <LhChatMain
        data-lh-hermit-main
        ref={scrollRef}
      >
        <div data-lh-chat-scroll-content data-empty={!hasMessages ? "true" : undefined}>
          {!hasMessages ? (
            <EmptyChatStart
              input={input}
              isLoading={isLoading}
              onInputChange={setInput}
              onSubmit={handleSubmit}
              onSuggestedQuestion={handleSuggestedQuestion}
            />
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && messages[messages.length - 1]?.role !== "assistant" && <TypingIndicator />}
            </>
          )}
        </div>
      </LhChatMain>

      {hasMessages && (
      <LhChatFooter data-lh-hermit-footer>
        <div data-lh-chat-footer-inner>
          <ChatInput value={input} onChange={setInput} onSubmit={handleSubmit} isLoading={isLoading} />
        </div>
      </LhChatFooter>
      )}
    </LhChatShell>
  );
}

function EmptyChatStart({
  input,
  isLoading,
  onInputChange,
  onSubmit,
  onSuggestedQuestion,
}: {
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onSuggestedQuestion: (question: string) => void;
}) {
  return (
    <section data-lh-hermit-empty>
      <article data-lh-hermit-empty-copy>
        <span data-lh-hermit-empty-icon>
          <Icon icon={lighthouseIcons.hermit} />
        </span>
        <div>
          <h2>把服务场景直接发给路引</h2>
          <p>
            说明客户状态、限制条件和你卡住的判断，路引会按事实、维度、依据和下一步动作回应。
          </p>
        </div>
        <div data-lh-hermit-empty-tags>
          <span>可追问</span>
          <span>会标出证据不足</span>
          <span>输出可执行动作</span>
        </div>
      </article>

      <div data-lh-hermit-empty-input>
        <ChatInput value={input} onChange={onInputChange} onSubmit={onSubmit} isLoading={isLoading} />
        <LhSuggestionList
          label="推荐问题"
          icon={<Icon data-lh-suggestion-heading-icon icon={lighthouseIcons.send} />}
          questions={SUGGESTED_QUESTIONS}
          onSelect={onSuggestedQuestion}
          disabled={isLoading}
        />
        <div data-lh-hermit-empty-guidance>
          <span>建议包含：客户状态、时间线、门店限制、已做动作。</span>
          <span>路引不替代现场责任与最终决策。</span>
        </div>
      </div>
    </section>
  );
}
