"use client";
import { useActionState } from "react";
import { removeAccount, setRetention, type SettingsState } from "@/app/actions/settings";
import { SubmitButton } from "./submit-button";
import { Field, Input, Notice, Select } from "./ui";

function Feedback({ state }: { state: SettingsState }) {
  if (state?.error) return <Notice tone="error">{state.error}</Notice>;
  if (state?.ok) return <p role="status" className="text-[14px] font-medium text-strong">{state.ok}</p>;
  return null;
}

export function RetentionForm({ days }: { days: number | null }) {
  const [state, action] = useActionState(setRetention, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Delete my resume files automatically" htmlFor="days" hint="Your profile stays; only the uploaded files are removed.">
        <Select id="days" name="days" defaultValue={days?.toString() ?? ""} className="max-w-[320px]">
          <option value="">Never. I'll delete them myself</option>
          <option value="30">30 days after upload</option>
          <option value="90">90 days after upload</option>
          <option value="180">180 days after upload</option>
          <option value="365">1 year after upload</option>
        </Select>
      </Field>
      <div className="flex items-center gap-3">
        <SubmitButton variant="secondary" pending="Saving…">Save</SubmitButton>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(removeAccount, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Feedback state={state} />
      <Field label="Type DELETE to confirm" htmlFor="confirm">
        <Input id="confirm" name="confirm" autoComplete="off" className="max-w-[240px]" />
      </Field>
      <div>
        <SubmitButton variant="danger" pending="Deleting…">Delete my account and all data</SubmitButton>
      </div>
    </form>
  );
}
