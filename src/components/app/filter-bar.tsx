"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "./inputs";
import { Select } from "./select";

export type Filter =
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[] }
  | { name: string; label: string; type: "date" }
  | { name: string; label: string; type: "search"; placeholder?: string }
  | { name: string; label: string; type: "toggle" };

/** URL-synced filters. Every change resets to page 1. */
export function FilterBar({ filters, presets }: { filters: Filter[]; presets?: { label: string; query: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = filters.find((f) => f.type === "search");
  const [q, setQ] = useState(params.get(search?.name ?? "q") ?? "");

  const set = (name: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(name, value);
    else p.delete(name);
    p.delete("page");
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };

  // Debounce the search box.
  useEffect(() => {
    if (!search) return;
    const current = params.get(search.name) ?? "";
    if (q === current) return;
    const t = setTimeout(() => set(search.name, q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = filters.some((f) => params.get(f.name));
  // On a phone the search box stays; the other filters fold behind one button.
  const [open, setOpen] = useState(false);
  const setCount = filters.filter((f) => f.type !== "search" && params.get(f.name)).length;
  const foldable = filters.some((f) => f.type !== "search");

  return (
    <div className="mb-4 space-y-3" data-print-hide>
      <div className="flex flex-wrap items-end gap-2">
        {filters.map((f) => {
          const id = `filter-${f.name}`;
          const value = params.get(f.name) ?? "";
          if (f.type === "search") {
            return (
              <div key={f.name} className="relative min-w-60 flex-1 max-md:min-w-0 max-md:basis-full">
                <label htmlFor={id} className="sr-only">{f.label}</label>
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-body" />
                <input id={id} type="search" className={cn(inputClass, "pl-9")} placeholder={f.placeholder ?? f.label} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            );
          }
          const fold = open ? "" : "max-md:hidden";
          if (f.type === "toggle") {
            return (
              <label key={f.name} className={cn(fold, "inline-flex h-10 cursor-pointer items-center gap-2 rounded-control border border-rule bg-sheet px-3 text-ui")}>
                <input type="checkbox" checked={value === "1"} onChange={(e) => set(f.name, e.target.checked ? "1" : "")} />
                {f.label}
              </label>
            );
          }
          return (
            <div key={f.name} className={cn(fold, "flex flex-col gap-1 max-md:basis-[calc(50%-0.25rem)]")}>
              <label htmlFor={id} className="text-caption text-slate-body">{f.label}</label>
              {f.type === "select" ? (
                <Select id={id} className="w-full md:w-auto md:min-w-40 md:max-w-72" value={value} onChange={(e) => set(f.name, e.target.value)} options={f.options} placeholder="All" clearable />
              ) : (
                <input id={id} type="date" className={cn(inputClass, "w-full md:w-auto")} value={value} onChange={(e) => set(f.name, e.target.value)} />
              )}
            </div>
          );
        })}
        {foldable && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex h-10 items-center gap-2 rounded-control border border-rule bg-sheet px-3 text-ui md:hidden">
            <SlidersHorizontal aria-hidden className="size-4" /> {open ? "Hide filters" : "Filters"}{setCount > 0 && <span className="rounded-badge bg-navy-700 px-1.5 text-caption text-white tabular-nums">{setCount}</span>}
          </button>
        )}
        {active && (
          <button type="button" onClick={() => { setQ(""); router.push(pathname); }} className="inline-flex h-10 items-center gap-1 rounded-control px-3 text-label text-info hover:bg-info-bg">
            <X aria-hidden className="size-4" /> Clear filters
          </button>
        )}
      </div>
      {presets && (
        <div className="flex flex-wrap items-center gap-2 text-label">
          <span className="text-slate-body">Saved views:</span>
          {presets.map((p) => {
            const current = `?${params.toString()}` === p.query || (!params.toString() && p.query === "");
            return (
              <Link key={p.label} href={`${pathname}${p.query}`} className={cn("rounded-badge px-2 py-1", current ? "bg-navy-700 text-white" : "text-info hover:bg-info-bg")} aria-current={current ? "page" : undefined}>
                {p.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
