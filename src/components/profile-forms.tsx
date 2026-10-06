"use client";
import { useActionState, useState, useTransition } from "react";
import { saveBasics, saveEducation, saveExperience, saveFocus, type ActionState } from "@/app/actions/profile";
import { COUNTRY_OPTIONS } from "@/lib/geo";
import { CountryMulti } from "./country-multi";
import { Field, Input, Notice, Select, Textarea } from "./ui";

function Feedback({ state }: { state: ActionState }) {
  if (state?.error) return <Notice tone="error">{state.error}</Notice>;
  if (state?.ok) return <p role="status" className="text-[14px] font-medium text-strong">{state.ok}</p>;
  return null;
}

export interface BasicsInitial {
  fullName: string;
  headline: string;
  summary: string;
  baseCountry: string;
  authorized: string[];
  sponsorship: "yes" | "no" | "unknown";
  remotePreference: string;
  salaryMin: string;
  salaryCurrency: string;
  languages: string;
}

/**
 * Submits through a transition instead of <form action>, so React doesn't
 * reset the form afterwards (which clashed with client-side field state).
 */
function useManualAction(fn: (prev: ActionState, fd: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(fn, undefined);
  const [, startTransition] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { state, onSubmit, pending };
}

function SaveButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="inline-flex h-10 items-center justify-center rounded-md bg-ink px-4 text-[14px] font-semibold text-paper hover:bg-ink-2 disabled:opacity-50">
      {pending ? "Saving…" : children}
    </button>
  );
}

export function BasicsForm({ initial }: { initial: BasicsInitial }) {
  const { state, onSubmit, pending } = useManualAction(saveBasics);
  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="fullName">
          <Input id="fullName" name="fullName" defaultValue={initial.fullName} autoComplete="name" />
        </Field>
        <Field label="Headline" htmlFor="headline" hint="How you describe yourself, e.g. “Full-stack developer”.">
          <Input id="headline" name="headline" defaultValue={initial.headline} />
        </Field>
      </div>
      <Field label="Summary" htmlFor="summary">
        <Textarea id="summary" name="summary" rows={4} defaultValue={initial.summary} />
      </Field>

      <fieldset className="grid gap-5 border-t border-line pt-5">
        <legend className="mb-1 text-[16px] font-bold">Where you can work</legend>
        <p className="-mt-3 text-[14px] text-ink-2">This decides which remote jobs you're eligible for. We never guess it.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Country you live in" htmlFor="baseCountry">
            <Select id="baseCountry" name="baseCountry" defaultValue={initial.baseCountry}>
              <option value="">Choose a country</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Countries where you're legally allowed to work" hint="Usually your citizenship and any work visas you hold.">
            <CountryMulti name="authorized" initial={initial.authorized} />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-[14px] font-semibold">Would you need visa sponsorship to work elsewhere?</legend>
            <div className="flex flex-wrap gap-4 text-[14.5px]">
              {[
                ["yes", "Yes"],
                ["no", "No"],
                ["unknown", "Not sure"],
              ].map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-2">
                  <input type="radio" name="sponsorship" value={v} defaultChecked={initial.sponsorship === v} className="size-4 accent-[var(--ink)]" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-[14px] font-semibold">Work arrangement</legend>
            <div className="flex flex-col gap-1.5 text-[14.5px]">
              {[
                ["remote_only", "Remote only"],
                ["remote_or_hybrid", "Remote or hybrid"],
                ["any", "Remote, hybrid or on-site"],
              ].map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-2">
                  <input type="radio" name="remotePreference" value={v} defaultChecked={initial.remotePreference === v} className="size-4 accent-[var(--ink)]" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="grid gap-5 sm:grid-cols-[1fr_120px_1fr]">
          <Field label="Minimum yearly salary (optional)" htmlFor="salaryMin">
            <Input id="salaryMin" name="salaryMin" inputMode="numeric" defaultValue={initial.salaryMin} placeholder="e.g. 40000" />
          </Field>
          <Field label="Currency" htmlFor="salaryCurrency">
            <Select id="salaryCurrency" name="salaryCurrency" defaultValue={initial.salaryCurrency}>
              {["USD", "EUR", "GBP", "NGN", "CAD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Languages you speak well enough to work in" htmlFor="languages" hint="Separate with commas.">
            <Input id="languages" name="languages" defaultValue={initial.languages} placeholder="English, French" />
          </Field>
        </div>
      </fieldset>
      <div className="flex items-center gap-4">
        <SaveButton pending={pending}>Save details</SaveButton>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function FocusForm({
  families,
  industries,
  selectedFamilies,
  selectedIndustries,
  seniority,
  years,
}: {
  families: { key: string; label: string }[];
  industries: { key: string; label: string }[];
  selectedFamilies: string[];
  selectedIndustries: string[];
  seniority: string;
  years: string;
}) {
  const { state, onSubmit, pending } = useManualAction(saveFocus);
  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Total years of professional experience" htmlFor="years">
          <Input id="years" name="years" inputMode="decimal" defaultValue={years} />
        </Field>
        <Field label="Level" htmlFor="seniority">
          <Select id="seniority" name="seniority" defaultValue={seniority}>
            {[
              ["unknown", "Not set"],
              ["intern", "Intern / student"],
              ["junior", "Junior"],
              ["mid", "Mid-level"],
              ["senior", "Senior"],
              ["lead", "Lead / staff"],
              ["principal", "Principal"],
              ["executive", "Director / executive"],
            ].map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-[14px] font-semibold">Kinds of roles you're looking for</legend>
        <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {families.map((f) => (
            <label key={f.key} className="inline-flex items-center gap-2 text-[14.5px]">
              <input type="checkbox" name="roleFamilies" value={f.key} defaultChecked={selectedFamilies.includes(f.key)} className="size-4 accent-[var(--ink)]" />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-[14px] font-semibold">Industries you've worked in</legend>
        <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((f) => (
            <label key={f.key} className="inline-flex items-center gap-2 text-[14.5px]">
              <input type="checkbox" name="industries" value={f.key} defaultChecked={selectedIndustries.includes(f.key)} className="size-4 accent-[var(--ink)]" />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-4">
        <SaveButton pending={pending}>Save focus</SaveButton>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export interface ExperienceInitial {
  id?: string;
  title: string;
  employer: string;
  location: string;
  start: string;
  end: string;
  current: boolean;
  highlights: string;
  skills: string;
}

export function ExperienceForm({ initial, onDone }: { initial?: ExperienceInitial; onDone?: () => void }) {
  const { state, onSubmit, pending } = useManualAction(async (prev: ActionState, fd: FormData) => {
    const r = await saveExperience(prev, fd);
    if (r?.ok && onDone) onDone();
    return r;
  });
  const [current, setCurrent] = useState(initial?.current ?? false);
  const uid = initial?.id ?? "new";
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title" htmlFor={`t-${uid}`}>
          <Input id={`t-${uid}`} name="title" defaultValue={initial?.title} required />
        </Field>
        <Field label="Employer" htmlFor={`e-${uid}`}>
          <Input id={`e-${uid}`} name="employer" defaultValue={initial?.employer} required />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Location" htmlFor={`l-${uid}`}>
          <Input id={`l-${uid}`} name="location" defaultValue={initial?.location} />
        </Field>
        <Field label="Started" htmlFor={`s-${uid}`}>
          <Input id={`s-${uid}`} name="start" type="month" defaultValue={initial?.start} />
        </Field>
        <Field label="Ended" htmlFor={`d-${uid}`}>
          <Input id={`d-${uid}`} name="end" type="month" defaultValue={initial?.end} disabled={current} />
        </Field>
      </div>
      <label className="inline-flex items-center gap-2 text-[14.5px]">
        <input type="checkbox" name="current" checked={current} onChange={(e) => setCurrent(e.target.checked)} className="size-4 accent-[var(--ink)]" />
        I work here now
      </label>
      <Field label="What you did" htmlFor={`h-${uid}`} hint="One achievement or responsibility per line. Only things you actually did.">
        <Textarea id={`h-${uid}`} name="highlights" rows={5} defaultValue={initial?.highlights} />
      </Field>
      <Field label="Skills used" htmlFor={`k-${uid}`} hint="Separate with commas.">
        <Input id={`k-${uid}`} name="skills" defaultValue={initial?.skills} />
      </Field>
      <div className="flex items-center gap-4">
        <SaveButton pending={pending}>{initial?.id ? "Save role" : "Add role"}</SaveButton>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export interface EducationInitial {
  id?: string;
  kind: string;
  institution: string;
  qualification: string;
  field: string;
  level: string;
  end: string;
}

export function EducationForm({ initial, onDone }: { initial?: EducationInitial; onDone?: () => void }) {
  const { state, onSubmit, pending } = useManualAction(async (prev: ActionState, fd: FormData) => {
    const r = await saveEducation(prev, fd);
    if (r?.ok && onDone) onDone();
    return r;
  });
  const uid = initial?.id ?? "new";
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type" htmlFor={`k-${uid}`}>
          <Select id={`k-${uid}`} name="kind" defaultValue={initial?.kind ?? "degree"}>
            <option value="degree">Degree or diploma</option>
            <option value="certification">Certification</option>
            <option value="course">Course</option>
          </Select>
        </Field>
        <Field label="School or issuer" htmlFor={`i-${uid}`}>
          <Input id={`i-${uid}`} name="institution" defaultValue={initial?.institution} required />
        </Field>
        <Field label="Completed" htmlFor={`d-${uid}`}>
          <Input id={`d-${uid}`} name="end" type="month" defaultValue={initial?.end} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Qualification" htmlFor={`q-${uid}`}>
          <Input id={`q-${uid}`} name="qualification" defaultValue={initial?.qualification} placeholder="e.g. BSc, AWS Certified Developer" />
        </Field>
        <Field label="Field of study" htmlFor={`f-${uid}`}>
          <Input id={`f-${uid}`} name="field" defaultValue={initial?.field} />
        </Field>
        <Field label="Level" htmlFor={`v-${uid}`}>
          <Select id={`v-${uid}`} name="level" defaultValue={initial?.level ?? ""}>
            <option value="">Not applicable</option>
            <option value="secondary">Secondary school</option>
            <option value="associate">Associate / diploma</option>
            <option value="bachelor">Bachelor's</option>
            <option value="master">Master's</option>
            <option value="doctorate">Doctorate</option>
            <option value="other">Other</option>
          </Select>
        </Field>
      </div>
      <div className="flex items-center gap-4">
        <SaveButton pending={pending}>{initial?.id ? "Save" : "Add"}</SaveButton>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function AddToggle({ label, kind }: { label: string; kind: "experience" | "education" }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center self-start rounded-md border border-dashed border-line-strong px-3 text-[14px] font-semibold text-ink-2 hover:border-ink hover:text-ink">
        {label}
      </button>
    );
  const close = () => setOpen(false);
  return (
    <div className="rounded-[10px] border border-line bg-paper p-4">
      {kind === "experience" ? <ExperienceForm onDone={close} /> : <EducationForm onDone={close} />}
      <button type="button" onClick={close} className="mt-3 text-[13.5px] text-ink-3 underline underline-offset-2">
        Cancel
      </button>
    </div>
  );
}
