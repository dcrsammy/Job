// Plan presentation shared by sign-up, pricing and settings.
import type { ReactNode } from "react";
import { PLAN_TIERS, planInfo, type PlanTier } from "@/lib/config";
import { cx, Tag } from "./ui";

/** Radio cards for choosing a plan inside a form (field name "plan"). */
export function PlanPicker({ defaultPlan = "free" }: { defaultPlan?: PlanTier }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-[14px] font-semibold">Choose a plan</legend>
      {PLAN_TIERS.map((p) => {
        const info = planInfo[p];
        return (
          <label
            key={p}
            className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-line-strong bg-surface p-3.5 has-[:checked]:border-ink has-[:checked]:shadow-[inset_3px_0_0_var(--tape)]"
          >
            <input type="radio" name="plan" value={p} defaultChecked={p === defaultPlan} className="mt-1 size-4 shrink-0 accent-[var(--ink)]" />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{info.name}</span>
                <span className="text-[13.5px] text-ink-2 num">{info.price}</span>
              </span>
              <span className="block text-[13.5px] text-ink-2">{info.blurb}</span>
            </span>
          </label>
        );
      })}
      <p className="text-[12.5px] text-ink-3">Paid plans start on Basic and switch over as soon as they're activated. You can change plan at any time in Settings.</p>
    </fieldset>
  );
}

/** One plan, with everything it includes. */
export function PlanCard({ plan, current, footer }: { plan: PlanTier; current?: boolean; footer?: ReactNode }) {
  const info = planInfo[plan];
  return (
    <div className={cx("flex flex-col rounded-[10px] border bg-surface p-5", current ? "border-ink shadow-[inset_0_3px_0_var(--tape)]" : "border-line")}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[18px] font-bold">{info.name}</h3>
        {current ? <Tag tone="tape">Your plan</Tag> : null}
      </div>
      <p className="mt-1 text-[22px] font-bold num">{info.price}</p>
      <p className="mt-1 text-[14px] text-ink-2">{info.blurb}</p>
      <ul className="mt-4 flex-1 space-y-1.5 text-[14px]">
        {info.points.map((pt) => (
          <li key={pt} className="flex gap-2">
            <span aria-hidden className="text-strong">✓</span>
            <span>{pt}</span>
          </li>
        ))}
      </ul>
      {footer ? <div className="mt-5">{footer}</div> : null}
    </div>
  );
}

/** Shown where a feature needs a higher plan. */
export function PlanUpsell({ needs, title, children }: { needs: "pro" | "premium"; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line-strong p-5">
      <p className="flex flex-wrap items-center gap-2 font-semibold">
        <Tag tone="tape">{planInfo[needs].name}</Tag> {title}
      </p>
      <p className="mt-1 text-[14px] text-ink-2">{children ?? planInfo[needs].blurb}</p>
      <a href="/settings#plan" className="mt-3 inline-flex h-9 items-center rounded-md bg-ink px-3.5 text-[13.5px] font-semibold text-paper hover:bg-ink-2">
        See {planInfo[needs].name}
      </a>
    </div>
  );
}
