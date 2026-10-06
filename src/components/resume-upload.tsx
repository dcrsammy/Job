"use client";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { uploadResume } from "@/app/actions/resume";
import { cx, Notice } from "./ui";

function UploadButton({ hasFile }: { hasFile: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!hasFile || pending}
      className="inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 text-[15px] font-semibold text-paper hover:bg-ink-2 disabled:opacity-50"
    >
      {pending ? "Reading your resume… this takes up to a minute" : "Upload and analyse"}
    </button>
  );
}

export function ResumeUpload({ replacing }: { replacing: boolean }) {
  const [state, action] = useActionState(uploadResume, undefined);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const tooBig = file && file.size > 5 * 1024 * 1024;

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <label
        htmlFor="resume"
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f && input.current) {
            const dt = new DataTransfer();
            dt.items.add(f);
            input.current.files = dt.files;
            setFile(f);
          }
        }}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed px-6 py-10 text-center",
          drag ? "border-ink bg-sunken" : "border-line-strong bg-surface hover:border-ink",
        )}
      >
        <span className="text-[16px] font-semibold">{file ? file.name : replacing ? "Choose a new resume" : "Choose your resume"}</span>
        <span className="text-[14px] text-ink-2">{file ? `${(file.size / 1024).toFixed(0)} KB` : "PDF or Word (.docx), up to 5 MB. Drag it here or click to browse."}</span>
        <input
          ref={input}
          id="resume"
          name="resume"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {tooBig ? <Notice tone="error">This file is larger than 5 MB.</Notice> : null}
      <div>
        <UploadButton hasFile={!!file && !tooBig} />
      </div>
    </form>
  );
}
