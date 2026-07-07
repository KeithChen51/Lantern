"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, useState, type FocusEvent, type FormEvent, type KeyboardEvent } from "react";
import { LhChatInputShell, LhChatSubmitButton, LhChatTextarea, LhLoadingGlyph } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

type ChatInputFocusOrigin = "none" | "pointer" | "keyboard";

export function ChatInput({ value, onChange, onSubmit, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusIntentRef = useRef<Exclude<ChatInputFocusOrigin, "none">>("keyboard");
  const [focusOrigin, setFocusOrigin] = useState<ChatInputFocusOrigin>("none");

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 156)}px`;
    }
  }, [value]);

  useEffect(() => {
    function handlePointerIntent() {
      focusIntentRef.current = "pointer";
    }

    function handleKeyboardIntent(event: globalThis.KeyboardEvent) {
      if (event.key === "Tab") {
        focusIntentRef.current = "keyboard";
      }
    }

    window.addEventListener("pointerdown", handlePointerIntent, true);
    window.addEventListener("keydown", handleKeyboardIntent, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerIntent, true);
      window.removeEventListener("keydown", handleKeyboardIntent, true);
    };
  }, []);

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

  function handleShellKeyDownCapture(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Tab") {
      focusIntentRef.current = "keyboard";
    }
  }

  function handleShellFocusCapture(event: FocusEvent<HTMLFormElement>) {
    if (event.target instanceof HTMLTextAreaElement) {
      setFocusOrigin(focusIntentRef.current);
    }
  }

  function handleShellBlurCapture(event: FocusEvent<HTMLFormElement>) {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setFocusOrigin("none");
    }
  }

  return (
    <LhChatInputShell
      data-lh-focus-origin={focusOrigin === "none" ? undefined : focusOrigin}
      onSubmit={handleSubmit}
      onPointerDownCapture={() => {
        focusIntentRef.current = "pointer";
      }}
      onKeyDownCapture={handleShellKeyDownCapture}
      onFocusCapture={handleShellFocusCapture}
      onBlurCapture={handleShellBlurCapture}
    >
      <div data-lh-chat-input-grid>
        <label data-lh-chat-input-label>
          <span className="sr-only">向路引提问</span>
          <LhChatTextarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述客户状态、现场限制和需要判断的问题"
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
          {isLoading ? (
            <LhLoadingGlyph data-lh-chat-submit-icon label="正在生成" />
          ) : (
            <Icon data-lh-chat-submit-icon icon={lighthouseIcons.send} />
          )}
        </LhChatSubmitButton>
      </div>
    </LhChatInputShell>
  );
}
