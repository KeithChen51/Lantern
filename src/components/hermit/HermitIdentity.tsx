"use client";

import { Icon } from "@iconify/react";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";
import styles from "./hermit-v3.module.css";

interface HermitIdentityProps {
  className?: string;
  size?: "sm" | "md";
}

/** The amber identity marker shared by the Hermit page and its replies. */
export function HermitIdentity({ className = "", size = "md" }: HermitIdentityProps) {
  return (
    <span
      className={`${styles.identity} ${size === "sm" ? styles.identitySmall : ""} ${className}`.trim()}
      data-lh-hermit-identity
      aria-hidden="true"
    >
      <Icon icon={lighthouseIcons.hermit} />
    </span>
  );
}
