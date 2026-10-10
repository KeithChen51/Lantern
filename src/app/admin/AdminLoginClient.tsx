"use client";

import * as React from "react";
import { Icon } from "@iconify/react";
import { LhButton, LhPanel, LhLoadingGlyph, LhTextField } from "@/components/ui/lighthouse-primitives";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import { PageHeading } from "@/components/ui/PageHeading";
import styles from "./admin.module.css";

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
    <div className={styles.adminLoginPage}>
      <PageHeading title="内容维护" description="管理笃行案例与知识中台资料的草稿、预览与发布。" />

      <LhPanel className={styles.adminLoginPanel}>
        <form className={styles.adminLoginForm} onSubmit={submit}>
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
      </LhPanel>
    </div>
  );
}
