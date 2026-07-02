"use client";

import { useChat } from "@ai-sdk/react";
import { Icon } from "@iconify/react";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { ChatInput } from "./ChatInput";
import { MessageBubble, TypingIndicator } from "./MessageBubble";
import { LhStatusBadge } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

const SUGGESTED_QUESTIONS = [
  "交车时间还没结论，客户一直追问时怎么回应？",
  "客户诉求和门店成本冲突时，先判断什么？",
  "客户情绪已经上来，第一句话怎么稳住？",
];

function getLocalGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 22 || hour < 5) return "深夜辛苦了";
  if (hour >= 18) return "晚上好";
  if (hour >= 14) return "下午好";
  if (hour >= 11) return "中午好";
  return "早上好";
}

function getTextContent(message: UIMessage) {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getConversationTitle(messages: UIMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const text = firstUserMessage ? getTextContent(firstUserMessage).trim() : "";
  if (!text) return "当前服务场景";
  return text.length > 34 ? `${text.slice(0, 34)}…` : text;
}

function isVisibleMessage(message: UIMessage) {
  return message.role !== "assistant" || getTextContent(message).trim().length > 0;
}

function shouldShowThinkingIndicator(messages: UIMessage[], isLoading: boolean) {
  if (!isLoading) return false;

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return true;
  if (lastMessage.role !== "assistant") return true;

  return getTextContent(lastMessage).trim().length === 0;
}

export function ChatPanel() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");
  const [greeting, setGreeting] = useState("您好");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;
  const conversationTitle = getConversationTitle(messages);
  const visibleMessages = messages.filter(isVisibleMessage);
  const showThinkingIndicator = shouldShowThinkingIndicator(messages, isLoading);

  useEffect(() => {
    function updateGreeting() {
      setGreeting(getLocalGreeting());
    }

    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(timer);
  }, []);

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

  if (!hasMessages) {
    return (
      <EmptyChatStart
        greeting={greeting}
        input={input}
        isLoading={isLoading}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onSuggestedQuestion={handleSuggestedQuestion}
      />
    );
  }

  return (
    <section data-lh-hermit-conversation aria-label="路引当前对话">
      <div data-lh-hermit-conversation-bar>
        <div data-lh-hermit-conversation-title>
          <span data-lh-hermit-conversation-icon>
            <Icon icon={lighthouseIcons.hermit} />
          </span>
          <div data-lh-hermit-conversation-copy>
            <span data-lh-hermit-conversation-kicker>当前场景</span>
            <strong data-lh-hermit-conversation-topic>{conversationTitle}</strong>
          </div>
        </div>
        <div data-lh-hermit-conversation-status>
          <LhStatusBadge tone={isLoading ? "warning" : "neutral"}>{isLoading ? "生成中" : "可追问"}</LhStatusBadge>
          <span>本心 · 镜鉴 · 笃行</span>
        </div>
      </div>

      <div
        data-lh-hermit-main
        ref={scrollRef}
      >
        <div data-lh-chat-scroll-content>
          {visibleMessages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {showThinkingIndicator && <TypingIndicator label="思考中" />}
        </div>
      </div>

      <footer data-lh-hermit-footer>
        <div data-lh-hermit-composer>
          <ChatInput value={input} onChange={setInput} onSubmit={handleSubmit} isLoading={isLoading} />
        </div>
      </footer>
    </section>
  );
}

function EmptyChatStart({
  greeting,
  input,
  isLoading,
  onInputChange,
  onSubmit,
  onSuggestedQuestion,
}: {
  greeting: string;
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onSuggestedQuestion: (question: string) => void;
}) {
  return (
    <section data-lh-hermit-start aria-labelledby="hermit-start-title">
      <div data-lh-hermit-start-inner>
        <h2 id="hermit-start-title" data-lh-hermit-start-title>
          <span data-lh-hermit-greeting>{greeting}</span>，我们来讨论什么服务场景？
        </h2>
        <div data-lh-hermit-start-input>
          <ChatInput value={input} onChange={onInputChange} onSubmit={onSubmit} isLoading={isLoading} />
        </div>
        <div data-lh-hermit-start-examples aria-label="可直接提问">
          {SUGGESTED_QUESTIONS.map((question) => (
            <button
              data-lh-hermit-start-example
              key={question}
              type="button"
              onClick={() => onSuggestedQuestion(question)}
              disabled={isLoading}
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
