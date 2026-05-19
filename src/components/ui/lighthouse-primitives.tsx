import * as React from "react";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

type ButtonVariant = "primary" | "signal" | "secondary" | "quiet" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";
type Tone = "neutral" | "primary" | "signal" | "success" | "warning" | "danger" | "info";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-primary bg-primary text-panel shadow-[0_1px_0_rgba(255,255,255,0.16)_inset,0_8px_16px_rgba(15,82,104,0.18)] hover:bg-primary-deep",
  signal:
    "border-signal bg-signal-soft text-signal-deep shadow-lh-sm hover:border-signal-deep hover:bg-signal",
  secondary:
    "border-line-strong bg-panel text-primary-deep shadow-lh-sm hover:border-primary hover:bg-primary-soft",
  quiet:
    "border-line bg-surface-quiet text-ink-soft hover:border-line-strong hover:bg-panel",
  ghost:
    "border-transparent bg-transparent text-primary-deep hover:bg-primary-soft",
  danger:
    "border-danger/30 bg-danger-soft text-danger hover:border-danger/50 hover:bg-danger-soft",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-xs",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

const toneClasses: Record<Tone, string> = {
  neutral: "border-line bg-surface-quiet text-muted",
  primary: "border-primary/20 bg-primary-soft text-primary-deep",
  signal: "border-signal/25 bg-signal-soft text-signal-deep",
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/25 bg-warning-soft text-warning",
  danger: "border-danger/25 bg-danger-soft text-danger",
  info: "border-info/25 bg-info-soft text-info",
};

export interface LhButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const LhButton = React.forwardRef<HTMLButtonElement, LhButtonProps>(
  ({ className, variant = "secondary", size = "md", icon, iconRight, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border font-bold leading-none transition-[background,border-color,box-shadow,transform,color] duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-55",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  ),
);
LhButton.displayName = "LhButton";

export interface LhIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: React.ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export const LhIconButton = React.forwardRef<HTMLButtonElement, LhIconButtonProps>(
  ({ className, label, icon, variant = "quiet", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm border font-bold transition-[background,border-color,box-shadow,transform,color] duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-55",
        size === "sm" ? "h-9 w-9 text-sm" : "h-11 w-11 text-base",
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  ),
);
LhIconButton.displayName = "LhIconButton";

export interface LhPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export const LhPanel = React.forwardRef<HTMLDivElement, LhPanelProps>(
  ({ className, elevated = false, ...props }, ref) => (
    <section
      ref={ref}
      className={cn(
        "rounded-md border border-line bg-surface text-ink",
        elevated ? "shadow-lh-md" : "shadow-lh-sm",
        className,
      )}
      {...props}
    />
  ),
);
LhPanel.displayName = "LhPanel";

export const LhCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <article
      ref={ref}
      className={cn("rounded-md border border-line bg-panel text-ink shadow-lh-sm", className)}
      {...props}
    />
  ),
);
LhCard.displayName = "LhCard";

export interface LhChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function LhChip({ className, tone = "neutral", ...props }: LhChipProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold leading-none",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

export interface LhStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  withDot?: boolean;
}

export function LhStatusBadge({ className, tone = "neutral", withDot = true, children, ...props }: LhStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold leading-none",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {withDot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

interface LhFieldShellProps {
  id?: string;
  label?: string;
  helperText?: string;
  error?: string;
  children: React.ReactNode;
}

function LhFieldShell({ id, label, helperText, error, children }: LhFieldShellProps) {
  return (
    <label className="grid gap-2" htmlFor={id}>
      {label && <span className="text-sm font-extrabold text-ink">{label}</span>}
      {children}
      {(helperText || error) && (
        <span className={cn("text-sm leading-6", error ? "font-bold text-danger" : "text-muted")}>
          {error ?? helperText}
        </span>
      )}
    </label>
  );
}

export interface LhTextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export const LhTextField = React.forwardRef<HTMLInputElement, LhTextFieldProps>(
  ({ className, label, helperText, error, leftIcon, id, ...props }, ref) => (
    <LhFieldShell id={id} label={label} helperText={helperText} error={error}>
      <span className="relative block">
        {leftIcon && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-primary">{leftIcon}</span>}
        <input
          ref={ref}
          id={id}
          aria-invalid={Boolean(error)}
          className={cn(
            "min-h-12 w-full rounded-sm border border-line-strong bg-panel px-4 text-base text-ink outline-none transition-[background,border-color,box-shadow] placeholder:text-muted focus:border-signal",
            leftIcon && "pl-10",
            error && "border-danger text-danger focus:border-danger",
            className,
          )}
          {...props}
        />
      </span>
    </LhFieldShell>
  ),
);
LhTextField.displayName = "LhTextField";

export interface LhTextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const LhTextArea = React.forwardRef<HTMLTextAreaElement, LhTextAreaProps>(
  ({ className, label, helperText, error, id, ...props }, ref) => (
    <LhFieldShell id={id} label={label} helperText={helperText} error={error}>
      <textarea
        ref={ref}
        id={id}
        aria-invalid={Boolean(error)}
        className={cn(
          "min-h-32 w-full resize-y rounded-sm border border-line-strong bg-panel px-4 py-3 text-base leading-7 text-ink outline-none transition-[background,border-color,box-shadow] placeholder:text-muted focus:border-signal",
          error && "border-danger text-danger focus:border-danger",
          className,
        )}
        {...props}
      />
    </LhFieldShell>
  ),
);
LhTextArea.displayName = "LhTextArea";

export const LhSearchBox = React.forwardRef<HTMLInputElement, Omit<LhTextFieldProps, "leftIcon">>(
  ({ className, ...props }, ref) => (
    <LhTextField
      ref={ref}
      leftIcon={<Icon icon={lighthouseIcons.search} className="h-5 w-5" />}
      className={cn("rounded-md", className)}
      {...props}
    />
  ),
);
LhSearchBox.displayName = "LhSearchBox";

export interface LhSectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function LhSectionHeader({ className, eyebrow, title, description, action, ...props }: LhSectionHeaderProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start", className)} {...props}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-primary-deep">{eyebrow}</p>}
        <h2 className="text-2xl font-extrabold leading-tight text-ink md:text-3xl">{title}</h2>
        {description && <p className="mt-3 max-w-3xl text-base leading-7 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function LhDataTableShell({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-md border border-line bg-panel shadow-lh-sm [&_table]:w-full [&_td]:border-t [&_td]:border-line [&_td]:px-4 [&_td]:py-3 [&_td]:text-sm [&_td]:text-ink-soft [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-extrabold [&_th]:uppercase [&_th]:tracking-[0.12em] [&_th]:text-muted",
        className,
      )}
      {...props}
    />
  );
}
