import type { Metadata } from "next";
import { addSkill, confirmProfile, confirmSkill, deleteEducation, deleteExperience, removeSkill } from "@/app/actions/profile";
import { AddToggle, BasicsForm, EducationForm, ExperienceForm, FocusForm } from "@/components/profile-forms";
import { ProvenanceTag } from "@/components/provenance";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, Input, LinkButton, Notice, PageHeader, Panel, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { INDUSTRIES } from "@/lib/matching/industries";
import { ROLE_FAMILIES } from "@/lib/matching/role-families";
import { loadCandidate, profileCompleteness } from "@/lib/services/candidate";
import { formatDates } from "@/lib/tailoring/generate";

export const metadata: Metadata = { title: "Career profile" };

const ym = (d: string | null) => (d ? d.slice(0, 7) : "");

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ from?: string; note?: string }> }) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const full = await loadCandidate(supabase, user.id);
  if (!full) return <EmptyState title="Profile not found" />;
  const p = full.profile;
  const completeness = profileCompleteness(full);
  const inferredCount =
    full.skills.filter((s) => s.provenance === "inferred").length +
    full.experiences.filter((e) => e.provenance === "inferred").length +
    full.educations.filter((e) => e.provenance === "inferred").length;
  const empty = full.skills.length === 0 && full.experiences.length === 0;

  return (
    <>
      <PageHeader
        title="Career profile"
        description="This is what we match jobs against. Check each item. Labels show whether it came from your resume, was inferred by us, or was added by you."
        actions={empty ? <LinkButton href="/resume">Upload resume</LinkButton> : null}
      />

      <div className="mb-8 flex flex-col gap-3">
        {sp.from === "upload" ? (
          <Notice tone={sp.note ? "warn" : "ok"}>
            {sp.note
              ? "We read your resume with our basic reader because AI analysis wasn't available. Please check every section carefully."
              : "We've read your resume. Review the details below, fill in anything missing, then confirm to see your matches."}
          </Notice>
        ) : null}
        {inferredCount > 0 ? <Notice tone="warn">{inferredCount} item{inferredCount > 1 ? "s are" : " is"} marked “Inferred: please check”. Edit or remove anything that isn't right.</Notice> : null}
      </div>

      <div className="flex flex-col gap-10">
        <section aria-labelledby="basics">
          <SectionTitle>
            <span id="basics">About you</span>
          </SectionTitle>
          <Panel className="p-5">
            <BasicsForm
              initial={{
                fullName: full.fullName ?? "",
                headline: p.headline ?? "",
                summary: p.summary ?? "",
                baseCountry: p.base_country ?? "",
                authorized: p.authorized_countries ?? [],
                sponsorship: p.needs_sponsorship == null ? "unknown" : p.needs_sponsorship ? "yes" : "no",
                remotePreference: p.remote_preference,
                salaryMin: p.salary_min?.toString() ?? "",
                salaryCurrency: p.salary_currency ?? "USD",
                languages: (p.languages ?? []).join(", "),
              }}
            />
          </Panel>
        </section>

        <section aria-labelledby="skills">
          <SectionTitle aside={<span className="text-[13.5px] text-ink-3 num">{full.skills.length} skills</span>}>
            <span id="skills">Skills</span>
          </SectionTitle>
          <Panel className="p-5">
            {full.skills.length ? (
              <ul className="flex flex-wrap gap-2">
                {full.skills.map((s) => (
                  <li key={s.id} className="group inline-flex items-center gap-1.5 rounded-md border border-line bg-paper py-1 pr-1 pl-2.5 text-[14px]">
                    <span className="font-medium">{s.name}</span>
                    {s.provenance === "inferred" ? (
                      <form action={confirmSkill}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="rounded bg-possible-soft px-1.5 text-[12px] font-medium text-possible" title="Not found word-for-word in your resume. Click to confirm you have this skill.">
                          Confirm
                        </button>
                      </form>
                    ) : (
                      <span className="sr-only">{s.provenance === "user" ? "added by you" : "from resume"}</span>
                    )}
                    <form action={removeSkill}>
                      <input type="hidden" name="id" value={s.id} />
                      <button aria-label={`Remove ${s.name}`} className="rounded px-1.5 text-ink-3 hover:bg-line hover:text-ink">×</button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-2">No skills yet.</p>
            )}
            <form action={addSkill} className="mt-4 flex max-w-[520px] gap-2">
              <Input name="name" placeholder="Add skills, separated by commas" aria-label="Add skills" />
              <SubmitButton variant="secondary" pending="Adding…">Add</SubmitButton>
            </form>
          </Panel>
        </section>

        <section aria-labelledby="experience">
          <SectionTitle>
            <span id="experience">Work history</span>
          </SectionTitle>
          <div className="flex flex-col gap-3">
            {full.experiences.map((e) => (
              <Panel key={e.id} as="article" className="p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-semibold">{e.title}</h3>
                    <p className="text-ink-2">
                      {e.employer}
                      {e.location ? `, ${e.location}` : ""}
                    </p>
                    <p className="text-[13.5px] text-ink-3 num">{formatDates({ startDate: e.start_date, endDate: e.end_date, isCurrent: e.is_current }) || "Dates missing"}</p>
                  </div>
                  <ProvenanceTag provenance={e.provenance} evidence={e.evidence} />
                </div>
                {e.highlights.length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-[14.5px] text-ink-2">
                    {e.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                ) : null}
                <details className="mt-4 group">
                  <summary className="cursor-pointer text-[14px] font-semibold text-ink-2 hover:text-ink">Edit this role</summary>
                  <div className="mt-4">
                    <ExperienceForm
                      initial={{
                        id: e.id,
                        title: e.title,
                        employer: e.employer,
                        location: e.location ?? "",
                        start: ym(e.start_date),
                        end: ym(e.end_date),
                        current: e.is_current,
                        highlights: e.highlights.join("\n"),
                        skills: e.skills.join(", "),
                      }}
                    />
                    <form action={deleteExperience} className="mt-3">
                      <input type="hidden" name="id" value={e.id} />
                      <SubmitButton variant="ghost" className="px-0 text-block hover:bg-transparent" confirm="Delete this role from your profile?" pending="Deleting…">
                        Delete role
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              </Panel>
            ))}
            <AddToggle label="Add a role" kind="experience" />
          </div>
        </section>

        <section aria-labelledby="education">
          <SectionTitle>
            <span id="education">Education & certifications</span>
          </SectionTitle>
          <div className="flex flex-col gap-3">
            {full.educations.map((e) => (
              <Panel key={e.id} as="article" className="p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold">{[e.qualification, e.field].filter(Boolean).join(", ") || e.institution}</h3>
                    <p className="text-ink-2">
                      {e.institution}
                      {e.end_date ? `, ${new Date(e.end_date).getUTCFullYear()}` : ""}
                    </p>
                  </div>
                  <ProvenanceTag provenance={e.provenance} evidence={e.evidence} />
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-[14px] font-semibold text-ink-2 hover:text-ink">Edit</summary>
                  <div className="mt-4">
                    <EducationForm
                      initial={{ id: e.id, kind: e.kind, institution: e.institution, qualification: e.qualification ?? "", field: e.field ?? "", level: e.level ?? "", end: ym(e.end_date) }}
                    />
                    <form action={deleteEducation} className="mt-3">
                      <input type="hidden" name="id" value={e.id} />
                      <SubmitButton variant="ghost" className="px-0 text-block hover:bg-transparent" confirm="Delete this item?" pending="Deleting…">
                        Delete
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              </Panel>
            ))}
            <AddToggle label="Add education or a certification" kind="education" />
          </div>
        </section>

        <section aria-labelledby="focus">
          <SectionTitle>
            <span id="focus">Career focus</span>
          </SectionTitle>
          <Panel className="p-5">
            <div className="mb-4 flex flex-wrap gap-2 text-[13.5px] text-ink-2">
              <span>Years and level:</span>
              <ProvenanceTag provenance={p.years_experience_provenance} evidence="Calculated from the dates of your roles" />
            </div>
            <FocusForm
              families={ROLE_FAMILIES.map((f) => ({ key: f.key, label: f.label }))}
              industries={INDUSTRIES.map((i) => ({ key: i.key, label: i.label }))}
              selectedFamilies={p.role_families ?? []}
              selectedIndustries={p.industries ?? []}
              seniority={p.seniority}
              years={p.years_experience?.toString() ?? ""}
            />
          </Panel>
        </section>

        <section aria-labelledby="confirm" className="rounded-[10px] border border-ink bg-surface p-5 sm:p-6">
          <h2 id="confirm" className="text-[18px] font-bold">{p.confirmed_at ? "Update your matches" : "Confirm your profile"}</h2>
          <p className="mt-1 max-w-[62ch] text-ink-2">
            Profile {completeness.percent}% complete.
            {completeness.missing.length ? ` Still useful to add: ${completeness.missing.slice(0, 3).join("; ").toLowerCase()}.` : ""}
          </p>
          <form action={confirmProfile} className="mt-4">
            <SubmitButton pending="Finding jobs that fit…" variant="primary">
              {p.confirmed_at ? "Save and refresh matches" : "Confirm and find my matches"}
            </SubmitButton>
          </form>
        </section>
      </div>
    </>
  );
}
