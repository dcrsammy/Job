import { matching } from "@/lib/config";
import { cx } from "./ui";

/**
 * The score drawn as a tailor's tape: a 0–100 scale with tick marks, the
 * low / possible / strong zones, and a yellow marker at the candidate's score.
 */
export function FitTape({
  score,
  size = "sm",
  blocked = false,
  animate = false,
  className,
}: {
  score: number;
  size?: "sm" | "lg";
  blocked?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const lg = size === "lg";
  const h = lg ? 44 : 22;
  const possible = matching.possibleThreshold;
  const strong = matching.strongThreshold;
  const zoneY = lg ? 24 : 12;
  const zoneH = lg ? 8 : 5;
  const ticks = Array.from({ length: 21 }, (_, i) => i * 5);
  return (
    <div className={cx("relative w-full", className)} role="img" aria-label={`Fit score ${s} out of 100${blocked ? ", not eligible" : ""}`}>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: h }} aria-hidden>
        <rect x="0" y={zoneY} width={possible} height={zoneH} fill="var(--low-soft)" />
        <rect x={possible} y={zoneY} width={strong - possible} height={zoneH} fill="var(--possible-soft)" />
        <rect x={strong} y={zoneY} width={100 - strong} height={zoneH} fill="var(--strong-soft)" />
        {ticks.map((t) => (
          <line
            key={t}
            x1={t === 100 ? 99.85 : t === 0 ? 0.15 : t}
            x2={t === 100 ? 99.85 : t === 0 ? 0.15 : t}
            y1={t % 10 === 0 ? zoneY - (lg ? 9 : 5) : zoneY - (lg ? 5 : 3)}
            y2={zoneY}
            stroke="var(--line-strong)"
            strokeWidth={0.3}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {lg ? (
        <div className="pointer-events-none absolute inset-x-0 top-[34px] h-4 text-[11px] text-ink-3 num" aria-hidden>
          {[0, possible, strong, 100].map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${t}%`, transform: t === 0 ? "none" : t === 100 ? "translateX(-100%)" : undefined }}>
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <div
        className={cx("absolute top-0 flex flex-col items-center", animate && "tape-marker-anim")}
        style={{ left: `${s}%`, transform: "translateX(-50%)" }}
        aria-hidden
      >
        <span
          className={cx("block", blocked ? "bg-block" : "bg-tape")}
          style={{ width: lg ? 12 : 8, height: lg ? 9 : 6, clipPath: "polygon(0 0, 100% 0, 50% 100%)" }}
        />
        <span className={cx("block", blocked ? "bg-block" : "bg-tape")} style={{ width: 2, height: lg ? 23 : 12 }} />
      </div>
    </div>
  );
}

export function bandTone(band: string, blocked: boolean): "strong" | "possible" | "low" | "block" {
  if (blocked) return "block";
  return band === "high" ? "strong" : band === "possible" ? "possible" : "low";
}

export function ScoreFigure({ score, label, band, blocked }: { score: number; label: string; band: string; blocked: boolean }) {
  const tone = bandTone(band, blocked);
  const color = { strong: "text-strong", possible: "text-possible", low: "text-low", block: "text-block" }[tone];
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[34px] leading-none font-bold num tracking-[-0.02em]">{score}</span>
      <span className="text-ink-3 num">/100</span>
      <span className={cx("ml-1 font-semibold", color)}>{label}</span>
    </div>
  );
}
