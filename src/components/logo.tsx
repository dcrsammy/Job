import Link from "next/link";
import { site } from "@/lib/config";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-ink" aria-label={`${site.name} home`}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill="var(--ink)" />
        <g stroke="var(--paper)" strokeWidth="1.6" strokeLinecap="round">
          <path d="M7 21v-4M11 21v-2.5M15 21v-4M19 21v-2.5M23 21v-4" />
        </g>
        <path d="M20 8h6l-3 5z" fill="var(--tape)" />
        <path d="M23 13v8" stroke="var(--tape)" strokeWidth="2" />
      </svg>
      <span className="text-[19px] font-bold tracking-[-0.02em]">{site.name}</span>
    </Link>
  );
}
