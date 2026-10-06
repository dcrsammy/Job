"use client";
import { useActionState } from "react";
import { followUpAction, interviewPrepAction } from "@/app/actions/premium";
import { SubmitButton } from "./submit-button";
import { Field, Input, Notice } from "./ui";

export function InterviewPrepForm({ jobId, again }: { jobId: string; again?: boolean }) {
  const [state, action] = useActionState(interviewPrepAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div>
        <SubmitButton variant={again ? "secondary" : "primary"} pending="Preparing your interview pack… this can take a minute">
          {again ? "Prepare again" : "Prepare me for this interview"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function FollowUpForm({ jobId, again }: { jobId: string; again?: boolean }) {
  const [state, action] = useActionState(followUpAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <Field label="Recruiter or hiring manager's name (optional)" htmlFor="contact">
        <Input id="contact" name="contact" className="max-w-[360px]" placeholder="e.g. Ada Obi" />
      </Field>
      {state?.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div>
        <SubmitButton variant={again ? "secondary" : "primary"} pending="Writing your email…">
          {again ? "Write it again" : "Write my follow-up email"}
        </SubmitButton>
      </div>
    </form>
  );
}
