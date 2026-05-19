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
    <form onSubmit={handleSubmit} className="rounded-sm border border-line-strong bg-panel p-3 shadow-lh-md transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[var(--shadow-focus)]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <label className="min-w-0">
          <span className="sr-only">向路引提问</span>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述服务场景、客户状态、门店限制和你想判断的分歧..."
            disabled={isLoading}
            rows={1}
            className="max-h-40 min-h-12 w-full resize-none bg-transparent px-2 py-2 text-base leading-7 text-ink outline-none placeholder:text-muted disabled:opacity-55"
          />
        </label>
        <button
          type="submit"
          disabled={!value.trim() || isLoading}
          aria-label={isLoading ? "正在生成" : "发送"}
          title={isLoading ? "正在生成" : "发送"}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border font-bold transition-[background,border-color,color] duration-150",
            "border-primary bg-primary text-panel shadow-[0_1px_2px_rgba(16,43,59,0.12),0_8px_18px_rgba(22,70,88,0.12)]",
            "hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-55",
          )}
        >
          <Icon icon={isLoading ? lighthouseIcons.refresh : lighthouseIcons.send} className={cn("h-5 w-5", isLoading && "animate-spin")} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2 text-xs font-bold leading-5 text-muted">
        <span className="rounded-sm bg-primary-deep px-2.5 py-1 text-panel">先讲场景</span>
        <span>再问“该怎么判断”或“下一步怎么说”。</span>
      </div>
    </form>
  );
}
