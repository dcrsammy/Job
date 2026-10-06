"use client";
import { useTransition } from "react";
import { downloadResumeUrl } from "@/app/actions/resume";

export function DownloadResume({ resumeId }: { resumeId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="underline underline-offset-2 hover:text-ink"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const url = await downloadResumeUrl(resumeId);
          if (url) window.location.href = url;
        })
      }
    >
      {pending ? "Preparing…" : "Download"}
    </button>
  );
}
