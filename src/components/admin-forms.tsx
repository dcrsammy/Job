"use client";
import { useActionState } from "react";
import { addSource, runSourceNow, type AdminState } from "@/app/actions/admin";
import { SubmitButton } from "./submit-button";
import { Field, Input, Select } from "./ui";

function Msg({ state }: { state: AdminState }) {
  if (state?.error) return <span role="alert" className="block max-w-[260px] text-[12.5px] text-block">{state.error}</span>;
  if (state?.ok) return <span role="status" className="block max-w-[260px] text-[12.5px] text-strong">{state.ok}</span>;
  return null;
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
