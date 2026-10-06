"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useState, type ReactNode } from "react";
import { addSource, runSourceNow, type AdminState } from "@/app/actions/admin";
import { SubmitButton } from "./submit-button";
import { cx, Field, Input, Select, type ButtonVariant } from "./ui";

function Msg({ state, wide }: { state: AdminState; wide?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (state?.error) return <span role="alert" className={cx("block text-[12.5px] text-block", !wide && "max-w-[260px]")}>{state.error}</span>;
  if (state?.ok)
    return (
      <span role="status" className={cx("block text-[12.5px] text-strong", !wide && "max-w-[320px]")}>
        {state.ok}
        {state.link ? (
          <span className="mt-1.5 flex items-center gap-2">
            <input readOnly value={state.link} className="h-8 min-w-0 flex-1 rounded border border-line-strong bg-surface px-2 text-[12px] text-ink" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="h-8 rounded border border-line-strong bg-surface px-2 text-[12px] font-semibold text-ink"
              onClick={async () => {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </span>
        ) : null}
      </span>
    );
  return null;
}

type AdminFn = (state: AdminState, form: FormData) => Promise<AdminState>;

/**
 * One admin "fix" button: hidden fields + optional inputs (children), with
 * an optional confirm prompt and the result shown inline.
 */
export function AdminAction({
  action,
  fields = {},
  label,
  pending = "Working…",
  confirm,
  variant = "secondary",
  children,
  inline,
  className,
}: {
  action: AdminFn;
  fields?: Record<string, string>;
  label: ReactNode;
  pending?: ReactNode;
  confirm?: string;
  variant?: ButtonVariant;
  children?: ReactNode;
  inline?: boolean;
  className?: string;
}) {
  const [state, run] = useActionState(action, undefined);
  return (
    <form action={run} className={cx("flex flex-col items-start gap-1.5", className)}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className={cx("flex flex-wrap items-center gap-2", !inline && !!children && "w-full")}>
        {children}
        <SubmitButton variant={variant} className="h-8 px-2.5 text-[12.5px]" pending={pending} confirm={confirm}>
          {label}
        </SubmitButton>
      </div>
      <Msg state={state} wide={!!state?.link} />
    </form>
  );
}

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/jobs", label: "Jobs & sources" },
  { href: "/admin/system", label: "System" },
];

export function AdminTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Admin sections" className="mb-8 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => {
        const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px flex h-10 shrink-0 items-center border-b-2 px-3 text-[14px]",
              active ? "border-ink font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function RunSourceButton({ id }: { id: string }) {
  const [state, action] = useActionState(runSourceNow, undefined);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="secondary" className="h-8 px-2.5 text-[12.5px]" pending="Running…">Run now</SubmitButton>
      <Msg state={state} />
    </form>
  );
}

export function AddSourceForm() {
  const [state, action] = useActionState(addSource, undefined);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Type" htmlFor="kind">
        <Select id="kind" name="kind" defaultValue="greenhouse">
          <option value="greenhouse">Greenhouse job board</option>
          <option value="lever">Lever job board</option>
          <option value="ashby">Ashby job board</option>
          <option value="jsonld">Careers pages (schema.org JobPosting)</option>
          <option value="adzuna">Adzuna (needs API keys)</option>
        </Select>
      </Field>
      <Field label="Employer or source name" htmlFor="name">
        <Input id="name" name="name" required />
      </Field>
      <Field label="Board name, or careers page URLs" htmlFor="key" hint="e.g. “gitlab” from boards.greenhouse.io/gitlab. For careers pages, paste https URLs separated by spaces.">
        <Input id="key" name="key" />
      </Field>
      <Field label="Refresh every (minutes)" htmlFor="interval">
        <Input id="interval" name="interval" type="number" min={60} defaultValue={360} />
      </Field>
      <label className="inline-flex items-center gap-2 text-[14px] sm:col-span-2">
        <input type="checkbox" name="official" defaultChecked className="size-4 accent-[var(--ink)]" />
        Listings come from the employer's own system (official application links)
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton pending="Adding…">Add source</SubmitButton>
        <Msg state={state} />
      </div>
    </form>
  );
}
