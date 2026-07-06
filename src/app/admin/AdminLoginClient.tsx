"use client";

import * as React from "react";
import { Icon } from "@iconify/react";
import { LhButton, LhCard, LhCallout, LhLoadingGlyph, LhPageHero, LhTextField } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

export function AdminLoginClient() {
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "管理密码验证失败。");
      }
      window.location.reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "管理密码验证失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <LhPageHero
        icon={<Icon icon={lighthouseIcons.admin} className="h-4 w-4" />}
        eyebrow="Admin"
        title="管理后台"
        description={<p>输入管理密码后，可以维护笃行案例，并进入共创审核区。</p>}
        asideTitle="访问规则"
        asideItems={[{ title: "24 小时有效" }, { title: "仅保护后台维护入口" }, { title: "不改变公开访问体验" }]}
      />

      <LhCard className="p-6">
        <form className="grid gap-5" onSubmit={submit}>
          <LhTextField
            id="admin-password"
            label="管理密码"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={error}
          />
          <LhButton
            type="submit"
            variant="primary"
            disabled={isSubmitting || password.trim().length === 0}
            icon={isSubmitting ? <LhLoadingGlyph label="正在验证" /> : <Icon icon={lighthouseIcons.admin} className="h-4 w-4" />}
          >
            进入后台
          </LhButton>
        </form>
      </LhCard>

      <LhCallout tone="warning" icon={<Icon icon={lighthouseIcons.warning} className="h-4 w-4" />} title="临时后台保护">
        这是内部维护入口的轻量密码门，不是完整账号系统。请只把密码给需要维护内容的人。
      </LhCallout>
    </div>
  );
}
