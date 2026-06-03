import * as React from "react";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

type ButtonVariant = "primary" | "signal" | "secondary" | "quiet" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";
type Tone = "neutral" | "primary" | "signal" | "success" | "warning" | "danger" | "info" | "brass";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-primary-deep bg-primary text-panel shadow-[0_1px_0_rgba(255,255,255,0.16)_inset,0_8px_16px_rgba(15,82,104,0.18)] hover:bg-primary-deep",
  signal:
    "border-signal bg-signal-soft text-signal-deep shadow-lh-sm hover:border-signal-deep hover:bg-primary-soft",
  secondary:
    "border-line-strong bg-panel text-primary-deep shadow-lh-sm hover:border-primary hover:bg-surface-quiet",
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
  brass: "border-brass/25 bg-brass-soft text-brass",
};

const calloutToneClasses: Record<Tone, string> = {
  neutral: "border-line bg-panel-soft text-ink-soft",
  primary: "border-primary/25 bg-primary-soft text-primary-deep",
  signal: "border-signal/25 bg-signal-soft text-signal-deep",
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/25 bg-warning-soft text-warning",
  danger: "border-danger/25 bg-danger-soft text-danger",
  info: "border-info/25 bg-info-soft text-info",
  brass: "border-brass/25 bg-brass-soft text-brass",
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
      data-lh-button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--lh-control-radius)] border font-bold leading-none transition-[background,border-color,box-shadow,color] duration-150 disabled:cursor-not-allowed disabled:opacity-55",
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
      data-lh-icon-button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[var(--lh-control-radius)] border font-bold transition-[background,border-color,box-shadow,color] duration-150 disabled:cursor-not-allowed disabled:opacity-55",
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
      data-lh-panel
      ref={ref}
      className={cn(
        "rounded-[var(--lh-card-radius)] border border-line bg-surface text-ink shadow-[var(--lh-card-shadow)]",
        elevated && "border-line-strong bg-surface shadow-[var(--lh-card-hover-shadow)]",
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
      data-lh-card
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-[var(--lh-card-radius)] border border-line bg-surface text-ink shadow-[var(--lh-card-shadow)]",
        className,
      )}
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
      data-lh-chip
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-[var(--lh-control-radius)] border px-2.5 py-1 text-xs font-bold leading-none",
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
      data-lh-status-badge
      className={cn(
        "inline-flex min-h-7 items-center gap-2 rounded-[var(--lh-control-radius)] border px-2.5 py-1 text-xs font-bold leading-none",
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
            "min-h-12 w-full rounded-[var(--lh-control-radius)] border border-line-strong bg-panel px-4 text-base text-ink outline-none transition-[background,border-color,box-shadow] placeholder:text-muted focus:border-signal",
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
          "min-h-32 w-full resize-y rounded-[var(--lh-card-radius)] border border-line-strong bg-panel px-4 py-3 text-base leading-7 text-ink outline-none transition-[background,border-color,box-shadow] placeholder:text-muted focus:border-signal",
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
      className={cn("rounded-sm", className)}
      {...props}
    />
  ),
);
LhSearchBox.displayName = "LhSearchBox";

export interface LhSectionHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function LhSectionHeader({ className, eyebrow, title, description, action, ...props }: LhSectionHeaderProps) {
  return (
    <div data-lh-section-header className={cn("grid gap-4 border-t border-line pt-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start", className)} {...props}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-3 inline-flex min-h-6 items-center rounded-[var(--lh-control-radius)] border border-primary/20 bg-primary-soft px-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-primary-deep">
            {eyebrow}
          </p>
        )}
        <h2 className="text-2xl font-extrabold leading-tight text-ink md:text-3xl">{title}</h2>
        {description && <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export interface LhCalloutProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: Tone;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
}

export function LhCallout({ className, tone = "neutral", icon, title, action, children, ...props }: LhCalloutProps) {
  return (
    <aside
      data-lh-callout
      className={cn(
        "grid gap-3 rounded-[var(--lh-card-radius)] border p-4 text-sm leading-6 shadow-[var(--lh-card-shadow)]",
        (icon || action) && "sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start",
        calloutToneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon && <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[var(--lh-control-radius)] border border-current/20 bg-panel/40 text-base">{icon}</span>}
      <span className="min-w-0">
        {title && <strong className="block text-sm font-extrabold leading-6 text-ink">{title}</strong>}
        {children && <span className="mt-1 block text-sm leading-6 text-ink-soft">{children}</span>}
      </span>
      {action}
    </aside>
  );
}

export interface LhMetricTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  description?: React.ReactNode;
  trend?: React.ReactNode;
  tone?: Tone;
}

export function LhMetricTile({ className, label, value, description, trend, tone = "neutral", ...props }: LhMetricTileProps) {
  return (
    <LhCard className={cn("grid gap-3 p-4", className)} {...props}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted">{label}</p>
        {trend && <LhChip tone={tone}>{trend}</LhChip>}
      </div>
      <strong className="text-3xl font-extrabold leading-none text-ink">{value}</strong>
      {description && <p className="text-sm leading-6 text-ink-soft">{description}</p>}
    </LhCard>
  );
}

export interface LhPageHeroAsideItem {
  title: React.ReactNode;
  description?: React.ReactNode;
}

export interface LhPageHeroProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode;
  eyebrow?: React.ReactNode;
  meta?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  asideTitle: React.ReactNode;
  asideItems: LhPageHeroAsideItem[];
  footer?: React.ReactNode;
}

export function LhPageHero({
  className,
  icon,
  eyebrow,
  meta,
  title,
  description,
  asideTitle,
  asideItems,
  footer,
  ...props
}: LhPageHeroProps) {
  return (
    <LhPanel data-lh-page-hero elevated className={cn("overflow-hidden", className)} {...props}>
      <div data-lh-page-hero-grid className="grid xl:grid-cols-[minmax(0,1fr)_320px]">
        <div data-lh-page-hero-body className="min-w-0 p-5 md:p-7">
          {(eyebrow || meta) && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {eyebrow && (
                <span className="inline-flex min-h-9 items-center gap-2 rounded-[var(--lh-control-radius)] bg-primary-deep px-3 text-sm font-extrabold text-panel">
                  {icon}
                  {eyebrow}
                </span>
              )}
              {meta}
            </div>
          )}
          <h1 data-lh-page-title className="max-w-4xl text-3xl font-extrabold leading-tight text-ink md:text-[2.45rem]">{title}</h1>
          {description && <div className="mt-4 max-w-4xl space-y-3 text-base leading-8 text-ink-soft">{description}</div>}
        </div>

        <aside data-lh-page-hero-aside className="relative overflow-hidden border-t border-line-strong/70 bg-[linear-gradient(180deg,var(--color-deck),var(--color-deck-soft))] p-5 text-[var(--color-deck-text)] shadow-lh-deck xl:border-l xl:border-t-0">
          <div className="absolute inset-x-5 top-0 h-0.5 bg-gradient-to-r from-action via-signal-soft/70 to-transparent" />
          <p className="text-xs font-extrabold text-[var(--color-deck-muted)]">{asideTitle}</p>
          <ol className="mt-4 grid gap-3">
            {asideItems.map((item, index) => (
              <li key={index} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--lh-control-radius)] border border-line/80 bg-panel/55 text-sm font-extrabold text-primary">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm font-extrabold leading-6 text-[var(--color-deck-text)]">{item.title}</strong>
                  {item.description && <span className="mt-1 block text-sm leading-6 text-[var(--color-deck-text-soft)]">{item.description}</span>}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
      {footer && <div data-lh-page-hero-footer className="border-t border-line bg-surface-quiet px-5 py-4 md:px-7">{footer}</div>}
    </LhPanel>
  );
}

export function LhDataTableShell({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-lh-data-table-shell
      className={cn(
        "overflow-x-auto rounded-[var(--lh-card-radius)] border border-line bg-panel shadow-[var(--lh-card-shadow)] [&_table]:w-full [&_td]:border-t [&_td]:border-line [&_td]:px-4 [&_td]:py-3 [&_td]:text-sm [&_td]:text-ink-soft [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-extrabold [&_th]:uppercase [&_th]:tracking-[0.12em] [&_th]:text-muted",
        className,
      )}
      {...props}
    />
  );
}
