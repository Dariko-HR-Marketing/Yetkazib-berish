"use client";
import { useEffect, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

// ---------------------------------------------------------------- Button
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean; full?: boolean };
export function Button({ variant = "primary", loading, full, className, children, disabled, ...rest }: ButtonProps) {
  const v = {
    primary: "bg-brand text-brand-on hover:bg-brand-dark border-transparent",
    secondary: "bg-surface text-ink border-line-strong hover:bg-bg",
    danger: "bg-danger-soft text-danger border-transparent",
    ghost: "bg-transparent text-ink-2 border-transparent hover:bg-line-soft",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx("inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-md border px-4 text-body font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50", v, full && "w-full", className)}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span role="status" aria-label="loading" className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

// ---------------------------------------------------------------- Field / Input
type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null; id: string };
export function Input({ label, hint, error, id, className, ...rest }: InputProps) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-semibold text-ink">{label}</label>
      <input
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx("min-h-touch w-full rounded-md border bg-surface px-3 text-body-lg text-ink placeholder:text-muted-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand", error ? "border-danger" : "border-line-strong", className)}
      />
      {hint && !error && <p id={`${id}-hint`} className="text-body-sm text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="text-body-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Card / Badge
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx("rounded-lg border border-line bg-surface p-4", className)} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "info" | "warning" | "danger"; children: ReactNode }) {
  const t = { neutral: "bg-line-soft text-ink-2", ok: "bg-brand-soft text-brand-dark", info: "bg-info-soft text-info", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger" }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-caption font-bold", t)}>{children}</span>;
}

// ---------------------------------------------------------------- Switch (44 px bosiladigan maydon)
export function Switch({ checked, onChange, disabled, label, busy }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-touch min-w-touch items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed"
    >
      <span className={cx("relative inline-block h-7 w-12 rounded-full transition-colors", checked ? "bg-brand" : "bg-line-strong", (disabled || busy) && "opacity-50")}>
        <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- Meter (limitlar)
export function Meter({ label, used, max, unlimitedLabel }: { label: string; used: number; max: number | null; unlimitedLabel: string }) {
  const pct = max === null || max === 0 ? 0 : Math.min(100, Math.round((used / max) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-body-sm"><span className="text-ink-2">{label}</span><span className="font-bold text-ink">{used} / {max === null ? unlimitedLabel : max}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line-soft" role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={max ?? undefined} aria-label={label}>
        <div className={cx("h-full rounded-full", pct >= 100 ? "bg-danger" : "bg-brand")} style={{ width: `${max === null ? 0 : pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Holatlar: yuklanish, bo'sh, xato
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-line-soft", className)} />;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong p-8 text-center">
      <p className="text-title-sm font-bold text-ink">{title}</p>
      {hint && <p className="text-body text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger bg-danger-soft p-4 text-danger">
      <p className="text-body font-semibold">{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>{retryLabel}</Button>}
    </div>
  );
}

/** Xabar yuqorida chiqadi (forma tugmalarini yopmaydi) va 5 soniyadan keyin o'zi yo'qoladi; bosilsa darhol yopiladi. */
export function Toast({ message, tone = "info", onClose, ms = 5000 }: { message: string; tone?: "info" | "ok" | "danger"; onClose: () => void; ms?: number }) {
  useEffect(() => {
    const id = setTimeout(onClose, ms);
    return () => clearTimeout(id);
  }, [message, onClose, ms]);
  const t = { info: "bg-ink text-bg", ok: "bg-brand text-brand-on", danger: "bg-danger text-white" }[tone];
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4" style={{ paddingTop: "calc(12px + var(--safe-top))" }}>
      <button onClick={onClose} className={cx("pointer-events-auto min-h-touch max-w-md rounded-lg px-4 py-2 text-left text-body font-semibold shadow-lg", t)}>{message}</button>
    </div>
  );
}
