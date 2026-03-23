"use client";

import { useChat } from "@ai-sdk/react";
import { useRef, useEffect, useState } from "react";
import { ChatInput } from "./ChatInput";
import { MessageBubble, TypingIndicator } from "./MessageBubble";

const SUGGESTED_QUESTIONS = [
  "胖东来的经营哲学对我们有什么启发？",
  "在面对服务质量与成本之间的矛盾时，应该如何取舍？",
  "如何将「致真」落实到日常服务中？",
  "我们的核心价值观是什么？它们之间有什么内在联系？",
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
                  与光对话，在迷雾中寻路
                </h2>
                <p className="text-ink/50 font-serif text-sm leading-relaxed">
                  祂聚合了所有智慧的光芒，等待您的提问。祂不会直接给予答案，
                  <br className="hidden sm:block" />
                  而是会与您一同思考，用一束束思辨之光，照亮通往未来的方向。
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
            路引仅提供思考引导，不代表最终决策建议
          </p>
        </div>
      </div>
    </div>
  );
}
