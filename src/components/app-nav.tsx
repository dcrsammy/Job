"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "./ui";

export const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/jobs", label: "Recommended jobs" },
  { href: "/search", label: "Search jobs" },
  { href: "/resume", label: "My resume" },
  { href: "/profile", label: "Career profile" },
  { href: "/builder", label: "Application builder" },
  { href: "/applications", label: "My applications" },
  { href: "/saved", label: "Saved jobs" },
  { href: "/settings", label: "Settings & privacy" },
];

function isActive(path: string, href: string) {
  if (href === "/jobs") return path === "/jobs" || (path.startsWith("/jobs/") && !path.endsWith("/apply"));
  if (href === "/builder") return path.startsWith("/builder") || path.endsWith("/apply");
  return path === href || path.startsWith(href + "/");
}

export function NavLinks({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const items = isAdmin ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(path, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex h-9 items-center rounded-md px-3 text-[14.5px]",
                active ? "bg-surface font-semibold text-ink shadow-[inset_3px_0_0_var(--tape)]" : "text-ink-2 hover:bg-sunken hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[14px] font-semibold"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d={open ? "M3 3l10 10M13 3L3 13" : "M2 4h12M2 8h12M2 12h12"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Menu
      </button>
      {open ? (
        <nav id="mobile-nav" aria-label="Main" className="absolute inset-x-0 top-16 z-30 border-b border-line bg-paper px-4 pb-4 shadow-lg">
          <NavLinks isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
        </nav>
      ) : null}
    </div>
  );
}
