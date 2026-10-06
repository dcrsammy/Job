import { countryName, REGIONS } from "./geo";

export function formatSalary(min: number | null, max: number | null, currency: string | null, period: string | null): string | null {
  if (!min && !max) return null;
  const cur = currency ?? "";
  const symbol = { USD: "$", EUR: "€", GBP: "£", NGN: "₦" }[cur] ?? (cur ? cur + " " : "");
  const k = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace(".0k", "k") : String(n));
  const range = min && max && min !== max ? `${symbol}${k(min)}–${symbol}${k(max)}` : `${symbol}${k((min ?? max)!)}`;
  const per = period === "hour" ? " an hour" : period === "month" ? " a month" : " a year";
  return range + per;
}

export function relativeDate(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 0) {
    const ahead = -days;
    return ahead === 0 ? "today" : ahead === 1 ? "tomorrow" : `in ${ahead} days`;
  }
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  return `over a year ago`;
}

export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function remoteLabel(type: string, regions: string[]): string {
  if (type === "remote") {
    if (regions.includes("WORLDWIDE")) return "Remote, worldwide";
    if (regions.length) return `Remote, ${regions.slice(0, 3).map((r) => REGIONS[r]?.label ?? countryName(r)).join(", ")}${regions.length > 3 ? " +" + (regions.length - 3) : ""}`;
    return "Remote, region not stated";
  }
  if (type === "hybrid") return "Hybrid";
  if (type === "onsite") return "On-site";
  return "Work location not stated";
}

export const STATUS_LABEL: Record<string, string> = {
  saved: "Saved",
  interested: "Interested",
  preparing: "Preparing",
  applied: "Applied",
  interview: "Interviewing",
  rejected: "Rejected",
  offer: "Offer",
  withdrawn: "Withdrawn",
  no_response: "No response",
  closed: "Listing closed",
};

/** Statuses after which a job should never be recommended again. */
export const FINISHED_STATUSES = ["applied", "interview", "offer", "rejected", "withdrawn", "no_response", "closed"] as const;
