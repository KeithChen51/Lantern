"use client";

import { useRef, useState } from "react";
import { LhButton, LhPanel, LhTextArea } from "@/components/ui/lighthouse-primitives";

export function ExternalAiAccess({ prompt }: { prompt?: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const promptText = useRef<HTMLTextAreaElement>(null);
  const [feedback, setFeedback] = useState("");

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setFeedback("已复制。请粘贴到你的 AI 客户端。");
    } catch {
      if (details.current) details.current.open = true;
      promptText.current?.focus();
      promptText.current?.select();
      setFeedback("暂时无法写入剪贴板。请手动复制已选中的提示词。");
    }
  }

  return (
    <LhPanel aria-label="使用其他 AI 接入灯塔" className="space-y-4 p-5 sm:p-8">
      <h2 className="text-[length:var(--type-lead)] font-[var(--weight-bold)] text-ink">使用其他 AI 接入灯塔</h2>
      <p className="text-[length:var(--type-body)] leading-[var(--leading-body)] text-muted">
        在 DSH 等支持 Skill 和 MCP 的 AI 客户端中使用路引，查询灯塔最新发布的资料。
      </p>
      {prompt ? (
        <>
          <p className="text-[length:var(--type-body)] leading-[var(--leading-body)] text-muted">
            将安装提示词粘贴到你的 AI。首次使用时，在灯塔确认当前登录账号并批准知识读取。
          </p>
          <LhButton type="button" variant="primary" className="w-full sm:w-auto" onClick={copyPrompt}>
            复制安装提示词
          </LhButton>
          <details ref={details}>
            <summary className="w-fit cursor-pointer rounded-[var(--lh-control-radius)] py-2 text-[length:var(--type-control)] text-primary-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              查看安装提示词
            </summary>
            <LhTextArea ref={promptText} aria-label="安装提示词" readOnly value={prompt} rows={6} className="mt-2 w-full" />
          </details>
          <p role="status" className={feedback ? "text-[length:var(--type-caption)] text-muted" : "sr-only"}>{feedback}</p>
        </>
      ) : (
        <p className="text-[length:var(--type-caption)] leading-[var(--leading-body)] text-muted">
          请通过灯塔的 HTTPS 站点登录员工或经销商账号后完成接入。
        </p>
      )}
    </LhPanel>
  );
}
