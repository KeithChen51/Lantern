"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { LhChatInputShell, LhChatSubmitButton, LhChatTextarea } from "@/components/ui/lighthouse-primitives";
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
    <LhChatInputShell onSubmit={handleSubmit}>
      <div data-lh-chat-input-grid>
        <label data-lh-chat-input-label>
          <span className="sr-only">向路引提问</span>
          <LhChatTextarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述客户状态、门店限制和你要判断的点……"
            disabled={isLoading}
            rows={1}
          />
        </label>
        <LhChatSubmitButton
          type="submit"
          disabled={!value.trim() || isLoading}
          aria-label={isLoading ? "正在生成" : "发送"}
          title={isLoading ? "正在生成" : "发送"}
        >
          <Icon data-lh-chat-submit-icon icon={isLoading ? lighthouseIcons.refresh : lighthouseIcons.send} className={cn(isLoading && "animate-spin")} />
        </LhChatSubmitButton>
      </div>
    </LhChatInputShell>
  );
}
