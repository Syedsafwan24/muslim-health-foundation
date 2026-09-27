"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, EyeOff, Search } from "lucide-react";
import { toast } from "sonner";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { setFiscalYear } from "@/app/(app)/prefs-actions";
import { setMeetingMode } from "@/app/(app)/settings/actions";
import { CommandPalette } from "./command-palette";
import { Select } from "./select";
import { cn } from "@/lib/utils";

export type Notice = { label: string; count: number; href: string };

export function Topbar({
  fy, years, canToggleMeetingMode, globalMeetingMode, notices,
}: {
  fy: string;
  years: string[];
  canToggleMeetingMode: boolean;
  globalMeetingMode: boolean;
  notices: Notice[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const total = notices.reduce((s, n) => s + n.count, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Plain comparison: browser autofill fires keydown events whose key is undefined.
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-rule bg-sheet px-4" data-print-hide>
      <SidebarTrigger aria-label="Toggle sidebar" />
      <label className="sr-only" htmlFor="fy-select">Fiscal year</label>
      <Select
        id="fy-select"
        value={fy}
        disabled={pending}
        onChange={(e) => start(async () => { await setFiscalYear(e.target.value); router.refresh(); })}
        className="h-9 w-auto font-medium tabular-nums"
        options={years.map((y) => ({ value: y, label: `FY ${y}` }))}
      />

      <button type="button" onClick={() => setPaletteOpen(true)} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-control border border-rule bg-paper px-3 text-left text-ui text-slate-body hover:border-navy-200 sm:max-w-md">
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="truncate">Search cases, people, vouchers…</span>
        <kbd className="ml-auto hidden rounded-badge border border-rule bg-sheet px-1.5 font-mono text-caption whitespace-nowrap lg:inline">Ctrl K</kbd>
      </button>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      <div className="ml-auto flex items-center gap-2">
        {canToggleMeetingMode && (
          <label className={cn("flex h-9 items-center gap-2 rounded-control px-3 text-label", globalMeetingMode ? "bg-redacted-bg text-redacted" : "text-slate-body")}>
            <EyeOff aria-hidden className="size-4" />
            <span className="hidden md:inline">Meeting mode</span>
            <Switch
              checked={globalMeetingMode}
              disabled={pending}
              aria-label="Hide identities for everyone"
              onCheckedChange={(on) =>
                start(async () => {
                  const r = await setMeetingMode({ on });
                  if (r.ok) toast.success(on ? "Identities hidden for everyone" : "Meeting mode turned off");
                  else toast.error(r.error);
                  router.refresh();
                })
              }
            />
          </label>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="relative grid size-10 place-items-center rounded-control text-slate-body hover:bg-navy-50" aria-label={`Notifications: ${total}`}>
              <Bell aria-hidden className="size-5" />
              {total > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-rejected px-1 text-center text-[11px] leading-4 font-medium text-white tabular-nums">{total > 99 ? "99+" : total}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b border-rule px-4 py-3 text-h3">Needs attention</div>
            {notices.filter((n) => n.count > 0).length === 0 ? (
              <p className="px-4 py-6 text-ui text-slate-body">Nothing needs your attention right now.</p>
            ) : (
              <ul className="py-1">
                {notices.filter((n) => n.count > 0).map((n) => (
                  <li key={n.label}>
                    <Link href={n.href} className="flex items-center justify-between px-4 py-2.5 text-ui hover:bg-navy-50">
                      {n.label}
                      <span className="font-medium tabular-nums">{n.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}

export function MeetingModeBanner({ reason }: { reason: "global" | "account" | "present" }) {
  const text = {
    global: "Identities are hidden for everyone — meeting mode is on.",
    account: "Identities are always hidden for this account.",
    present: "Identities are hidden in the present view.",
  }[reason];
  return (
    <div role="status" className="sticky top-14 z-20 flex items-center gap-2 bg-redacted px-4 py-2 text-label text-white" data-print-hide>
      <EyeOff aria-hidden className="size-4" />
      {text} Case numbers, person codes, medical and financial details stay visible.
    </div>
  );
}
