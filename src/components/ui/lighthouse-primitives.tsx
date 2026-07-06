import * as React from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";
import { lighthouseIcons } from "@/components/ui/lighthouse-icons";

type ButtonVariant = "primary" | "signal" | "secondary" | "quiet" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";
type Tone = "neutral" | "primary" | "signal" | "success" | "warning" | "danger" | "info" | "brass";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-primary-deep bg-primary text-panel shadow-[0_1px_0_rgba(255,255,255,0.16)_inset,0_8px_16px_rgba(217,119,6,0.18)] hover:bg-primary-deep",
  signal:
    "border-signal bg-signal-soft text-signal-text shadow-lh-sm hover:border-signal-deep hover:bg-primary-soft",
  secondary:
    "border-line-strong bg-panel text-primary-text shadow-lh-sm hover:border-primary hover:bg-surface-quiet",
  quiet:
    "border-line bg-surface-quiet text-ink-soft hover:border-line-strong hover:bg-panel",
  ghost:
    "border-transparent bg-transparent text-primary-text hover:bg-primary-soft",
  danger:
    "border-danger/30 bg-danger-soft text-danger-text hover:border-danger/50 hover:bg-danger-soft",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-[length:var(--type-caption)] leading-[var(--leading-caption)]",
  md: "min-h-11 px-4 text-[length:var(--type-control)] leading-[var(--leading-control)]",
  lg: "min-h-12 px-5 text-[length:var(--type-body)] leading-[var(--leading-body)]",
};

const toneClasses: Record<Tone, string> = {
  neutral: "border-line bg-surface-quiet text-muted",
  primary: "border-primary/20 bg-primary-soft text-primary-text",
  signal: "border-signal/25 bg-signal-soft text-signal-text",
  success: "border-success/25 bg-success-soft text-success-text",
  warning: "border-warning/25 bg-warning-soft text-warning-text",
  danger: "border-danger/25 bg-danger-soft text-danger-text",
  info: "border-info/25 bg-info-soft text-info-text",
  brass: "border-brass/25 bg-brass-soft text-brass-text",
};

const calloutToneClasses: Record<Tone, string> = {
  neutral: "border-line bg-panel-soft text-ink-soft",
  primary: "border-primary/25 bg-primary-soft text-primary-text",
  signal: "border-signal/25 bg-signal-soft text-signal-text",
  success: "border-success/25 bg-success-soft text-success-text",
  warning: "border-warning/25 bg-warning-soft text-warning-text",
  danger: "border-danger/25 bg-danger-soft text-danger-text",
  info: "border-info/25 bg-info-soft text-info-text",
  brass: "border-brass/25 bg-brass-soft text-brass-text",
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
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--lh-control-radius)] border font-[var(--weight-extrabold)] transition-[background,border-color,box-shadow,color,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] active:translate-y-px active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0 disabled:active:scale-100",
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
        "inline-flex shrink-0 items-center justify-center rounded-[var(--lh-control-radius)] border font-[var(--weight-extrabold)] leading-[var(--leading-control)] transition-[background,border-color,box-shadow,color,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] active:translate-y-px active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0 disabled:active:scale-100",
        size === "sm" ? "h-9 w-9 text-[length:var(--type-control)]" : "h-11 w-11 text-[length:var(--type-reading)]",
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

export interface LhLoadingGlyphProps extends React.HTMLAttributes<HTMLSpanElement> {
  label?: string;
}

export function LhLoadingGlyph({ className, label = "Loading", ...props }: LhLoadingGlyphProps) {
  return (
    <span data-lh-loading-glyph role="status" aria-label={label} className={cn("inline-flex items-center justify-center", className)} {...props}>
      <Icon icon={lighthouseIcons.refresh} aria-hidden="true" />
    </span>
  );
}

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
        "inline-flex min-h-6 items-center gap-1.5 rounded-[var(--lh-control-radius)] border px-2.5 py-1 text-[length:var(--type-caption)] font-[var(--weight-bold)] leading-[var(--leading-caption)]",
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
        "inline-flex min-h-7 items-center gap-2 rounded-[var(--lh-control-radius)] border px-2.5 py-1 text-[length:var(--type-caption)] font-[var(--weight-bold)] leading-[var(--leading-caption)]",
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

export type LhBackLinkProps = React.ComponentProps<typeof Link> & {
  icon?: React.ReactNode;
};

export function LhBackLink({ className, icon, children, ...props }: LhBackLinkProps) {
  return (
    <Link
      data-lh-back-link
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-[var(--lh-control-radius)] border border-line bg-panel px-3 text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-primary-text transition-[background,border-color,box-shadow,color,transform] duration-[var(--lh-motion-fast)] ease-[var(--lh-ease-standard)] hover:border-line-strong hover:bg-primary-soft active:translate-y-px active:scale-[0.985]",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </Link>
  );
}

export interface LhContentProseProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "reading" | "compact";
}

const contentProseVariants: Record<NonNullable<LhContentProseProps["variant"]>, string> = {
  reading: "text-[length:var(--type-reading)] leading-[var(--leading-reading)]",
  compact: "text-[length:var(--type-body)] leading-[var(--leading-body)]",
};

export function LhContentProse({ className, variant = "reading", ...props }: LhContentProseProps) {
  return (
    <div
      data-lh-content-prose
      className={cn(
        "max-w-none text-ink-soft",
        contentProseVariants[variant],
        "[&_blockquote]:my-5 [&_blockquote]:rounded-[var(--lh-control-radius)] [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:bg-surface-quiet [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-muted",
        "[&_h2]:mb-4 [&_h2]:mt-2 [&_h2]:text-[length:var(--title-section)] [&_h2]:font-[var(--weight-extrabold)] [&_h2]:leading-[1.14] [&_h2]:text-ink",
        "[&_h3]:mb-3 [&_h3]:mt-8 [&_h3]:text-[length:var(--title-card)] [&_h3]:font-[var(--weight-extrabold)] [&_h3]:leading-[1.2] [&_h3]:text-ink",
        "[&_h4]:mb-2 [&_h4]:mt-6 [&_h4]:text-[length:var(--type-lead)] [&_h4]:font-[var(--weight-extrabold)] [&_h4]:leading-[1.25] [&_h4]:text-ink",
        "[&_hr]:my-6 [&_hr]:border-line",
        "[&_li]:pl-1 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_ol:last-child]:mb-0 [&_p]:mb-4 [&_p:last-child]:mb-0 [&_strong]:font-[var(--weight-extrabold)] [&_strong]:text-ink [&_ul]:mb-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul:last-child]:mb-0",
        className,
      )}
      {...props}
    />
  );
}

export interface LhStateNoticeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: Tone;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
}

export function LhStateNotice({
  className,
  tone = "neutral",
  icon,
  title,
  action,
  children,
  role,
  ...props
}: LhStateNoticeProps) {
  const noticeRole = role ?? (tone === "danger" || tone === "warning" ? "alert" : "status");

  return (
    <aside
      data-lh-state-notice
      role={noticeRole}
      className={cn(
        "grid gap-3 rounded-[var(--lh-card-radius)] border p-4 text-[length:var(--type-body)] leading-[var(--leading-body)] shadow-[var(--lh-card-shadow)]",
        (icon || action) && "sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start",
        calloutToneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon && <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[var(--lh-control-radius)] border border-current/20 bg-panel/40 text-[length:var(--type-reading)]">{icon}</span>}
      <span className="min-w-0">
        {title && <strong className="block text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-ink">{title}</strong>}
        {children && <span className="mt-1 block text-[length:var(--type-body)] leading-[var(--leading-body)] text-ink-soft">{children}</span>}
      </span>
      {action}
    </aside>
  );
}

export interface LhEmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: Tone;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}

export function LhEmptyState({
  className,
  tone = "neutral",
  icon,
  title,
  description,
  action,
  secondaryAction,
  ...props
}: LhEmptyStateProps) {
  return (
    <LhPanel
      data-lh-empty-state
      className={cn("grid gap-4 border-dashed bg-surface-quiet p-6 text-center md:grid-cols-[auto_minmax(0,1fr)_auto] md:text-left", className)}
      {...props}
    >
      {icon && (
        <span className={cn("mx-auto flex h-11 w-11 items-center justify-center rounded-[var(--lh-control-radius)] border text-[length:var(--type-lead)] md:mx-0", toneClasses[tone])}>
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <strong className="block text-[length:var(--title-card)] font-[var(--weight-extrabold)] leading-[1.2] text-ink">{title}</strong>
        {description && <span className="mt-2 block max-w-3xl text-[length:var(--type-body)] leading-[var(--leading-body)] text-ink-soft">{description}</span>}
      </span>
      {(action || secondaryAction) && (
        <span className="flex flex-wrap items-center justify-center gap-2 md:justify-end">
          {secondaryAction}
          {action}
        </span>
      )}
    </LhPanel>
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
      {label && <span className="text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-ink">{label}</span>}
      {children}
      {(helperText || error) && (
        <span className={cn("text-[length:var(--type-label)] leading-[var(--leading-label)]", error ? "font-[var(--weight-bold)] text-danger-text" : "text-muted")}>
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
        {leftIcon && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-primary-text">{leftIcon}</span>}
        <input
          ref={ref}
          id={id}
          aria-invalid={Boolean(error)}
          className={cn(
            "min-h-12 w-full rounded-[var(--lh-control-radius)] border border-line-strong bg-panel px-4 text-[length:var(--type-reading)] leading-[var(--leading-reading)] text-ink transition-[background,border-color,box-shadow] placeholder:text-muted focus-visible:border-[var(--lh-focus-outline)]",
            leftIcon && "pl-10",
            error && "border-danger text-ink focus-visible:border-danger-text",
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
          "min-h-32 w-full resize-y rounded-[var(--lh-card-radius)] border border-line-strong bg-panel px-4 py-3 text-[length:var(--type-reading)] leading-[var(--leading-reading)] text-ink transition-[background,border-color,box-shadow] placeholder:text-muted focus-visible:border-[var(--lh-focus-outline)]",
          error && "border-danger text-ink focus-visible:border-danger-text",
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

export const LhChatShell = React.forwardRef<HTMLDivElement, LhPanelProps>(
  ({ className, ...props }, ref) => (
    <LhPanel
      data-lh-chat-shell
      elevated
      ref={ref}
      className={cn("w-full", className)}
      {...props}
    />
  ),
);
LhChatShell.displayName = "LhChatShell";

export const LhChatHeader = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => <header data-lh-chat-header ref={ref} className={className} {...props} />,
);
LhChatHeader.displayName = "LhChatHeader";

export const LhChatMain = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => <main data-lh-chat-main ref={ref} className={className} {...props} />,
);
LhChatMain.displayName = "LhChatMain";

export const LhChatFooter = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => <footer data-lh-chat-footer ref={ref} className={className} {...props} />,
);
LhChatFooter.displayName = "LhChatFooter";

export const LhChatInputShell = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(
  ({ className, ...props }, ref) => <form data-lh-chat-input ref={ref} className={className} {...props} />,
);
LhChatInputShell.displayName = "LhChatInputShell";

export const LhChatTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea data-lh-chat-textarea ref={ref} className={className} {...props} />,
);
LhChatTextarea.displayName = "LhChatTextarea";

export const LhChatSubmitButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => <button data-lh-chat-submit ref={ref} className={className} {...props} />,
);
LhChatSubmitButton.displayName = "LhChatSubmitButton";

export interface LhMessageRowProps extends React.HTMLAttributes<HTMLElement> {
  messageRole: "assistant" | "user";
}

export function LhMessageRow({ className, messageRole, ...props }: LhMessageRowProps) {
  return <article data-lh-message-row data-role={messageRole} className={className} {...props} />;
}

export interface LhMessageAvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "assistant" | "user";
}

export function LhMessageAvatar({ className, variant = "assistant", ...props }: LhMessageAvatarProps) {
  return <span data-lh-message-avatar data-variant={variant} className={className} {...props} />;
}

export interface LhMessageBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "assistant" | "user" | "typing";
}

export function LhMessageBubble({ className, variant = "assistant", ...props }: LhMessageBubbleProps) {
  return <div data-lh-message-bubble data-variant={variant} className={className} {...props} />;
}

export interface LhSuggestionListProps {
  label: React.ReactNode;
  icon?: React.ReactNode;
  questions: readonly string[];
  disabled?: boolean;
  hideLabel?: boolean;
  onSelect: (question: string) => void;
}

export function LhSuggestionList({ label, icon, questions, disabled = false, hideLabel = false, onSelect }: LhSuggestionListProps) {
  return (
    <section data-lh-suggestion-list data-lh-hermit-suggestions aria-label={String(label)}>
      {!hideLabel && (
        <div data-lh-suggestion-heading>
          {icon}
          {label}
        </div>
      )}
      <div data-lh-suggestion-items>
        {questions.map((question) => (
          <button
            data-lh-suggestion-button
            data-lh-hermit-suggested-question
            key={question}
            type="button"
            onClick={() => onSelect(question)}
            disabled={disabled}
          >
            {question}
          </button>
        ))}
      </div>
    </section>
  );
}

export interface LhMetaListItem {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
}

export interface LhMetaListProps extends React.HTMLAttributes<HTMLDListElement> {
  items: readonly LhMetaListItem[];
  columns?: 1 | 2;
}

export function LhMetaList({ className, items, columns = 1, ...props }: LhMetaListProps) {
  return (
    <dl data-lh-meta-list data-columns={columns} className={className} {...props}>
      {items.map((item, index) => (
        <div data-lh-meta-item key={index}>
          {item.icon && <span data-lh-meta-icon>{item.icon}</span>}
          <span data-lh-meta-copy>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </span>
        </div>
      ))}
    </dl>
  );
}

export interface LhSegmentedControlOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface LhSegmentedControlProps<T extends string> extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  label: string;
  options: readonly LhSegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function LhSegmentedControl<T extends string>({
  className,
  label,
  options,
  value,
  onChange,
  ...props
}: LhSegmentedControlProps<T>) {
  return (
    <div data-lh-segmented-control className={className} role="group" aria-label={label} {...props}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            data-lh-segment
            data-active={active ? "true" : undefined}
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface LhSubmissionCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  badges?: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
}

export function LhSubmissionCard({ className, title, badges, meta, action, footer, children, ...props }: LhSubmissionCardProps) {
  return (
    <LhCard data-lh-submission-card className={className} {...props}>
      <div data-lh-submission-card-header>
        <span data-lh-submission-card-copy>
          {badges && <span data-lh-submission-card-badges>{badges}</span>}
          <h3>{title}</h3>
          {meta && <span data-lh-submission-card-meta>{meta}</span>}
        </span>
        {action}
      </div>
      {children && <div data-lh-submission-card-body>{children}</div>}
      {footer && <div data-lh-submission-card-footer>{footer}</div>}
    </LhCard>
  );
}

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
          <p className="mb-3 inline-flex min-h-6 items-center rounded-[var(--lh-control-radius)] border border-primary/20 bg-primary-soft px-2.5 text-[length:var(--title-kicker)] font-[var(--weight-black)] uppercase leading-[1.2] tracking-[var(--tracking-kicker)] text-primary-text">
            {eyebrow}
          </p>
        )}
        <h2 className="text-[length:var(--title-section)] font-[var(--weight-bold)] leading-[1.14] text-ink">{title}</h2>
        {description && <p className="mt-3 max-w-3xl text-[length:var(--type-body)] leading-[var(--leading-body)] text-muted">{description}</p>}
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
        "grid gap-3 rounded-[var(--lh-card-radius)] border p-4 text-[length:var(--type-body)] leading-[var(--leading-body)] shadow-[var(--lh-card-shadow)]",
        (icon || action) && "sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start",
        calloutToneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon && <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[var(--lh-control-radius)] border border-current/20 bg-panel/40 text-[length:var(--type-reading)]">{icon}</span>}
      <span className="min-w-0">
        {title && <strong className="block text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-ink">{title}</strong>}
        {children && <span className="mt-1 block text-[length:var(--type-body)] leading-[var(--leading-body)] text-ink-soft">{children}</span>}
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
        <p className="text-[length:var(--title-kicker)] font-[var(--weight-black)] uppercase leading-[1.2] tracking-[var(--tracking-kicker)] text-muted">{label}</p>
        {trend && <LhChip tone={tone}>{trend}</LhChip>}
      </div>
      <strong className="text-[length:var(--title-section)] font-[var(--weight-extrabold)] leading-none text-ink">{value}</strong>
      {description && <p className="text-[length:var(--type-body)] leading-[var(--leading-body)] text-ink-soft">{description}</p>}
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
                <span className="inline-flex min-h-9 items-center gap-2 rounded-[var(--lh-control-radius)] bg-primary-deep px-3 text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-panel">
                  {icon}
                  {eyebrow}
                </span>
              )}
              {meta}
            </div>
          )}
          <h1 data-lh-page-title className="max-w-4xl text-[length:var(--title-page)] font-[var(--weight-black)] leading-[1.1] text-ink">{title}</h1>
          {description && <div className="mt-4 max-w-4xl space-y-3 text-[length:var(--type-reading)] leading-[var(--leading-reading)] text-ink-soft">{description}</div>}
        </div>

        <aside data-lh-page-hero-aside className="relative overflow-hidden border-t border-line-strong/70 bg-[linear-gradient(180deg,var(--color-deck),var(--color-deck-soft))] p-5 text-[var(--color-deck-text)] shadow-lh-deck xl:border-l xl:border-t-0">
          <div className="absolute inset-x-5 top-0 h-0.5 bg-gradient-to-r from-action via-signal-soft/70 to-transparent" />
          <p className="text-[length:var(--title-kicker)] font-[var(--weight-black)] leading-[1.2] tracking-[var(--tracking-kicker)] text-[var(--color-deck-muted)]">{asideTitle}</p>
          <ol className="mt-4 grid gap-3">
            {asideItems.map((item, index) => (
              <li key={index} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-[var(--lh-control-radius)] border border-line/80 bg-panel/55 text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-primary-text">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <strong className="block text-[length:var(--type-control)] font-[var(--weight-extrabold)] leading-[var(--leading-control)] text-[var(--color-deck-text)]">{item.title}</strong>
                  {item.description && <span className="mt-1 block text-[length:var(--type-body)] leading-[var(--leading-body)] text-[var(--color-deck-text-soft)]">{item.description}</span>}
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
        "overflow-x-auto rounded-[var(--lh-card-radius)] border border-line bg-panel shadow-[var(--lh-card-shadow)] [&_table]:w-full [&_td]:border-t [&_td]:border-line [&_td]:px-4 [&_td]:py-3 [&_td]:text-[length:var(--type-body)] [&_td]:leading-[var(--leading-body)] [&_td]:text-ink-soft [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-[length:var(--type-caption)] [&_th]:font-[var(--weight-black)] [&_th]:uppercase [&_th]:leading-[var(--leading-caption)] [&_th]:tracking-[var(--tracking-kicker)] [&_th]:text-muted",
        className,
      )}
      {...props}
    />
  );
}
