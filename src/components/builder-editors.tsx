"use client";
import { useActionState, useState } from "react";
import { generatePackage, saveAnswer, saveCoverLetter, saveResumeText, type BuilderState } from "@/app/actions/builder";
import { SubmitButton } from "./submit-button";
import { Notice, Textarea } from "./ui";

function Saved({ state }: { state: BuilderState }) {
  if (state?.error) return <span role="alert" className="text-[14px] text-block">{state.error}</span>;
  if (state?.ok) return <span role="status" className="text-[14px] font-medium text-strong">{state.ok}</span>;
  return null;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-[13.5px] font-semibold hover:border-ink"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function GenerateForm({ jobId, label, disabled }: { jobId: string; label: string; disabled?: boolean }) {
  const [state, action] = useActionState(generatePackage, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div>
        <SubmitButton pending="Preparing your application… this can take a minute" variant="primary">
          {label}
        </SubmitButton>
      </div>
      {disabled ? null : null}
    </form>
  );
}

function hasPlaceholder(s: string) {
  return /\[[^\]]{2,}\]/.test(s);
}

export function TextEditor({
  kind,
  appId,
  answerId,
  initial,
  rows = 14,
  extra,
}: {
  kind: "resume" | "cover" | "answer";
  appId: string;
  answerId?: string;
  initial: string;
  rows?: number;
  extra?: React.ReactNode;
}) {
  const fn = kind === "resume" ? saveResumeText : kind === "cover" ? saveCoverLetter : saveAnswer;
  const [state, action] = useActionState(fn, undefined);
  const [text, setText] = useState(initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="appId" value={appId} />
      {answerId ? <input type="hidden" name="answerId" value={answerId} /> : null}
      <Textarea name="text" rows={rows} value={text} onChange={(e) => setText(e.target.value)} className="font-[inherit] text-[14.5px]" aria-label={kind === "resume" ? "Tailored resume" : kind === "cover" ? "Cover letter" : "Answer"} />
      {hasPlaceholder(text) ? <p className="text-[13.5px] text-possible">Fill in the parts in [square brackets] before you send this.</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant="secondary" pending="Saving…">Save</SubmitButton>
        <CopyButton text={text} />
        {extra}
        <Saved state={state} />
      </div>
    </form>
  );
}
