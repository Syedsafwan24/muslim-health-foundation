"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsNav({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="lg:sticky lg:top-20 lg:self-start">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined}
                className={cn("block rounded-control px-3 py-2 text-ui whitespace-nowrap", active ? "bg-navy-700 text-white" : "text-navy-900 hover:bg-navy-50")}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
