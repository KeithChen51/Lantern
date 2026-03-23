"use client";

import { useRef, useState, useEffect, type FormEvent, type KeyboardEvent } from "react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function ChatInput({ value, onChange, onSubmit, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, [value]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || isLoading) return;
    onSubmit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!value.trim() || isLoading) return;
      onSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div
        className={`
          flex items-end gap-3 rounded-2xl border backdrop-blur-md
          bg-white/40 shadow-[0_-4px_30px_rgba(0,0,0,0.04)]
          transition-all duration-300
          ${isFocused
            ? "border-amber/40 shadow-[0_0_20px_rgba(217,119,6,0.08)]"
            : "border-white/60"
          }
          px-4 py-3
        `}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="在此提问，与路引对话…"
          disabled={isLoading}
          rows={1}
          className="
            flex-1 resize-none bg-transparent outline-none
            text-ink placeholder:text-ink/30
            font-serif text-base leading-relaxed
            max-h-40 py-1
            disabled:opacity-50
          "
        />
        <button
          type="submit"
          disabled={!value.trim() || isLoading}
          className="
            flex-shrink-0 flex items-center justify-center
            w-10 h-10 rounded-xl
            bg-amber text-white
            transition-all duration-300
            hover:bg-amber/90 hover:shadow-[0_0_15px_rgba(217,119,6,0.3)]
            disabled:opacity-30 disabled:hover:bg-amber disabled:hover:shadow-none
            active:scale-95
          "
        >
          {isLoading ? (
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </form>
  );
}
