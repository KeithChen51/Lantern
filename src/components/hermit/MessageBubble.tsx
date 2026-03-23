"use client";

import { Icon } from "@iconify/react";
import ReactMarkdown from "react-markdown";
import type { UIMessage } from "ai";

interface MessageBubbleProps {
  message: UIMessage;
}

/**
 * Extract the text content from a UIMessage's parts array.
 */
function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const text = getTextContent(message);

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} items-start`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 mt-1">
          <div className="w-8 h-8 rounded-lg bg-amber/10 flex items-center justify-center">
            <Icon
              icon="game-icons:lighthouse"
              className="w-4.5 h-4.5 text-amber drop-shadow-[0_0_4px_rgba(217,119,6,0.4)]"
            />
          </div>
        </div>
      )}

      {/* Bubble */}
      <div
        className={`
          max-w-[80%] rounded-2xl px-5 py-3.5 leading-relaxed
          ${isUser
            ? "bg-ink/8 text-ink font-sans text-sm"
            : "bg-amber/5 border border-amber/10 text-ink/85 font-serif text-[0.95rem]"
          }
        `}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <div className="hermit-prose">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
                ul: ({ children }) => <ul className="list-disc list-outside pl-4 mb-3 last:mb-0 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-outside pl-4 mb-3 last:mb-0 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="text-ink/80">{children}</li>,
                h3: ({ children }) => <h3 className="font-bold text-ink text-base mt-4 mb-2 font-noto">{children}</h3>,
                h4: ({ children }) => <h4 className="font-bold text-ink text-sm mt-3 mb-1.5 font-noto">{children}</h4>,
                blockquote: ({ children }) => <blockquote className="border-l-2 border-amber/30 pl-3 my-3 text-ink/60 italic">{children}</blockquote>,
                hr: () => <hr className="border-ink/10 my-4" />,
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Typing indicator shown while the agent is generating a response.
 */
export function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <div className="flex-shrink-0 mt-1">
        <div className="w-8 h-8 rounded-lg bg-amber/10 flex items-center justify-center">
          <Icon
            icon="game-icons:lighthouse"
            className="w-4.5 h-4.5 text-amber drop-shadow-[0_0_4px_rgba(217,119,6,0.4)] animate-pulse"
          />
        </div>
      </div>
      <div className="bg-amber/5 border border-amber/10 rounded-2xl px-5 py-3.5">
        <div className="flex gap-1.5 items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-amber/40 animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber/40 animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber/40 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
