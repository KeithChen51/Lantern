"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function ChatInput({ value, onChange, onSubmit, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 156)}px`;
    }
  }, [value]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim() || isLoading) return;
    onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!value.trim() || isLoading) return;
      onSubmit();
    }
  }

  return (
    <form
      data-lh-chat-input
      onSubmit={handleSubmit}
      style={{
        borderColor: "var(--lh-chat-input-border, var(--color-line-strong))",
        boxShadow: "var(--lh-chat-input-shadow, var(--shadow-card))",
      }}
      className="rounded-md border border-line-strong bg-panel p-3 shadow-lh-md"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <label className="min-w-0">
          <span className="sr-only">向路引提问</span>
          <textarea
            data-lh-chat-textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="直接向路引提问，或描述一个具体服务场景..."
            disabled={isLoading}
            rows={1}
            className="max-h-40 min-h-14 w-full resize-none bg-transparent px-2 py-2 text-base leading-7 text-ink outline-none placeholder:text-muted disabled:opacity-55"
          />
        </label>
        <button
          data-lh-chat-submit
          type="submit"
          disabled={!value.trim() || isLoading}
          aria-label={isLoading ? "正在生成" : "发送"}
          title={isLoading ? "正在生成" : "发送"}
          style={{
            background: "var(--lh-chat-submit-bg, var(--color-action))",
            borderColor: "var(--lh-chat-submit-border, var(--color-action))",
            boxShadow: "var(--lh-chat-submit-shadow, 0 1px 2px rgba(82, 57, 22, 0.12), 0 8px 18px rgba(185, 130, 46, 0.16))",
            color: "var(--lh-chat-submit-color, var(--color-panel))",
          }}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border font-bold transition-[background,border-color,color] duration-150",
            "border-action bg-action text-panel shadow-[0_1px_2px_rgba(82,57,22,0.12),0_8px_18px_rgba(185,130,46,0.16)]",
            "hover:bg-action-deep disabled:cursor-not-allowed disabled:opacity-55",
          )}
        >
          <Icon icon={isLoading ? lighthouseIcons.refresh : lighthouseIcons.send} className={cn("h-5 w-5", isLoading && "animate-spin")} />
        </button>
      </div>
    </form>
  );
}
