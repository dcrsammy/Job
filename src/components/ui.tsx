import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 h-10 text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
export const buttonVariants = {
  primary: "bg-ink text-paper hover:bg-ink-2",
  secondary: "bg-surface text-ink border border-line-strong hover:border-ink",
  ghost: "text-ink-2 hover:text-ink hover:bg-sunken",
  danger: "bg-block text-white hover:opacity-90",
  apply: "bg-tape text-tape-ink hover:brightness-95",
} as const;
export type ButtonVariant = keyof typeof buttonVariants;

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function LinkButton({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function ExternalButton({ variant = "apply", className, ...props }: ComponentProps<"a"> & { variant?: ButtonVariant }) {
  return <a target="_blank" rel="noopener" className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[14px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[13px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-line-strong bg-surface px-3 h-10 text-[15px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputCls, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputCls, "h-auto py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputCls, "pr-8", className)} {...props} />;
}

export function Panel({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={cx("rounded-[10px] border border-line bg-surface", className)}>{children}</As>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.01em] text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-[65ch] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Tag({ tone = "neutral", children, title }: { tone?: "neutral" | "strong" | "possible" | "low" | "block" | "tape"; children: ReactNode; title?: string }) {
  const tones = {
    neutral: "bg-sunken text-ink-2",
    strong: "bg-strong-soft text-strong",
    possible: "bg-possible-soft text-possible",
    low: "bg-low-soft text-low",
    block: "bg-block-soft text-block",
    tape: "bg-tape text-tape-ink",
  };
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12.5px] font-medium leading-5", tones[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-[17px] font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-[52ch] text-ink-2">{children}</div> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const tones = {
    info: "border-line bg-sunken text-ink",
    warn: "border-possible/40 bg-possible-soft text-ink",
    error: "border-block/40 bg-block-soft text-ink",
    ok: "border-strong/40 bg-strong-soft text-ink",
  };
  return <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-md border px-4 py-3 text-[14px]", tones[tone])}>{children}</div>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[18px] font-bold tracking-[-0.005em]">{children}</h2>
      {aside}
    </div>
  );
}
