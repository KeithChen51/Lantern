"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect, useState } from "react";
import { ChatInput } from "./ChatInput";
import { MessageBubble, TypingIndicator } from "./MessageBubble";

const SUGGESTED_QUESTIONS = [
  "这个案例应该如何判断主维度与关联维度？",
  "善和爱在服务案例里应该怎么区分？",
  "客户利益和员工承压发生冲突时，应该怎么判断？",
  "真、善、美、爱之间有交叉时，应该如何分析？",
];

export function ChatPanel() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, status]);

  const hasMessages = messages.length > 0;

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
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-0 scroll-smooth"
      >
        {!hasMessages ? (
          /* Welcome state */
          <div className="flex flex-col items-center justify-center h-full py-20">
            <div className="text-center max-w-lg space-y-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber/10 flex items-center justify-center mb-2">
                <svg
                  className="w-8 h-8 text-amber drop-shadow-[0_0_8px_rgba(217,119,6,0.3)]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
              </div>

              <div>
                <h2 className="text-2xl font-serif text-ink mb-2">
                  把问题带回具体场景
                </h2>
                <p className="text-ink/50 font-serif text-sm leading-relaxed">
                  路引不会替你做最终决定，也不会把价值观变成简单标签。
                  <br className="hidden sm:block" />
                  它会帮助你回到事实、处境和选择，辨析主维度、关联维度与下一步。
                </p>
              </div>

              {/* Suggested questions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSuggestedQuestion(q)}
                    className="
                      text-left p-4 rounded-xl
                      bg-white/40 border border-white/60
                      text-ink/70 text-sm font-serif leading-relaxed
                      hover:bg-amber/5 hover:border-amber/20 hover:text-ink
                      transition-all duration-300
                      shadow-[0_2px_10px_rgba(0,0,0,0.03)]
                      hover:shadow-[0_4px_20px_rgba(217,119,6,0.06)]
                    "
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="max-w-3xl mx-auto py-8 space-y-6">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
              />
            ))}
            {isLoading &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <TypingIndicator />
              )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-4 md:px-0 pb-6 pt-3">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
          <p className="text-center text-xs text-ink/25 mt-3 font-serif">
            路引提供价值辨析与思考引导，不替代现场责任与最终决策
          </p>
        </div>
      </div>
    </div>
  );
}
