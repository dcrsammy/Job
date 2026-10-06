import type { ComponentScore } from "@/lib/types";
import { FitTape, ScoreFigure } from "./fit-tape";
import { cx } from "./ui";

const STATUS: Record<ComponentScore["status"], { label: string; cls: string }> = {
  met: { label: "Meets", cls: "text-strong" },
  partial: { label: "Partly", cls: "text-possible" },
  missing: { label: "Gap", cls: "text-block" },
  unknown: { label: "Unclear", cls: "text-ink-3" },
};

export function MatchBreakdown({
  score,
  band,
  label,
  components,
  reasons,
  gaps,
  disqualifiers,
  uncertain,
  adjustments,
}: {
  score: number;
  band: string;
  label: string;
  components: ComponentScore[];
  reasons: string[];
  gaps: string[];
  disqualifiers: string[];
  uncertain: string[];
  adjustments: string[];
}) {
  const blocked = disqualifiers.length > 0;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <ScoreFigure score={score} label={label} band={band} blocked={blocked} />
        <FitTape score={score} size="lg" blocked={blocked} animate className="mt-4 mb-5" />
      </div>
      {disqualifiers.length ? (
        <div className="rounded-md border border-block/40 bg-block-soft px-4 py-3">
          <p className="font-semibold text-block">You may not be eligible</p>
          <ul className="mt-1 list-disc pl-5 text-[14.5px]">
            {disqualifiers.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <table className="w-full text-[14px]">
        <caption className="sr-only">How the score was calculated</caption>
        <thead className="sr-only">
          <tr>
            <th>Factor</th>
            <th>Result</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {components.map((c) => (
            <tr key={c.key} className="align-top">
              <td className="py-2.5 pr-3">
                <p className="font-semibold">{c.label}</p>
                <p className="text-ink-2">{c.detail}</p>
              </td>
              <td className={cx("w-16 py-2.5 pr-3 font-medium", STATUS[c.status].cls)}>{STATUS[c.status].label}</td>
              <td className="w-16 py-2.5 text-right whitespace-nowrap num">
                <span className="font-semibold">{c.points}</span>
                <span className="text-ink-3">/{c.max}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {adjustments.length ? (
        <p className="text-[13.5px] text-ink-2">
          {adjustments.join(" ")}
        </p>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        {reasons.length ? (
          <div>
            <h3 className="mb-1.5 font-semibold">Why you fit</h3>
            <ul className="space-y-1 text-[14.5px]">
              {reasons.map((r) => (
                <li key={r} className="flex gap-2"><span aria-hidden className="text-strong">✓</span>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {gaps.length ? (
          <div>
            <h3 className="mb-1.5 font-semibold">Gaps</h3>
            <ul className="space-y-1 text-[14.5px]">
              {gaps.map((g) => (
                <li key={g} className="flex gap-2"><span aria-hidden className="text-possible">–</span>{g}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {uncertain.length ? (
        <div>
          <h3 className="mb-1.5 font-semibold">Check before applying</h3>
          <ul className="space-y-1 text-[14.5px] text-ink-2">
            {uncertain.map((u) => (
              <li key={u} className="flex gap-2"><span aria-hidden>?</span>{u}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
