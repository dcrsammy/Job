"use client";
import { useMemo, useState } from "react";
import { COUNTRY_OPTIONS } from "@/lib/geo";
import { Input } from "./ui";

export function CountryMulti({ name, initial }: { name: string; initial: string[] }) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [q, setQ] = useState("");
  const matches = useMemo(
    () => (q.trim() ? COUNTRY_OPTIONS.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()) && !selected.includes(c.code)).slice(0, 6) : []),
    [q, selected],
  );
  const nameOf = (code: string) => COUNTRY_OPTIONS.find((c) => c.code === code)?.name ?? code;
  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={selected.join(",")} />
      {selected.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected countries">
          {selected.map((c) => (
            <li key={c} className="inline-flex items-center gap-1 rounded bg-sunken py-0.5 pr-1 pl-2 text-[13.5px]">
              {nameOf(c)}
              <button type="button" aria-label={`Remove ${nameOf(c)}`} className="rounded px-1 text-ink-3 hover:bg-line hover:text-ink" onClick={() => setSelected((s) => s.filter((x) => x !== c))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a country"
          aria-label="Add a country"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // Enter adds the top suggestion and must never submit the surrounding form.
            e.preventDefault();
            const term = e.currentTarget.value.trim().toLowerCase();
            const hit = COUNTRY_OPTIONS.find((c) => c.name.toLowerCase().startsWith(term)) ?? COUNTRY_OPTIONS.find((c) => c.name.toLowerCase().includes(term));
            if (term && hit && !selected.includes(hit.code)) setSelected((s) => [...s, hit.code]);
            setQ("");
          }}
        />
        {matches.length ? (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line-strong bg-surface shadow-lg">
            {matches.map((m) => (
              <li key={m.code}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-sunken"
                  onClick={() => {
                    setSelected((s) => [...s, m.code]);
                    setQ("");
                  }}
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
