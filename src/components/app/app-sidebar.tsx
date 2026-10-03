"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Banknote, Building2, ChevronDown, ClipboardList, FileText, HandCoins, KeyRound, LayoutDashboard, LogOut, Receipt,
  Settings, Stethoscope, UserRound, Users, Vault, History,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu,
  SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import { signOutAction } from "@/app/(app)/prefs-actions";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };
export type NavGroup = { label?: string; items: NavItem[] };

const ICONS = {
  dashboard: LayoutDashboard, applications: ClipboardList, patients: UserRound, applicants: Users, payments: Banknote,
  donations: HandCoins, expenses: Receipt, funds: Vault, hospitals: Building2, diseases: Stethoscope,
  reports: BarChart3, settings: Settings, file: FileText, password: KeyRound, activity: History,
};

export function AppSidebar({ groups, footer, user }: { groups: NavGroup[]; footer: NavItem[]; user: { name: string; role: string } }) {
  const pathname = usePathname();
  const { setOpen } = useSidebar();
  // On a 10" tablet the full sidebar takes a third of the screen: start collapsed to icons.
  useEffect(() => {
    if (window.innerWidth < 1024) setOpen(false);
  }, [setOpen]);
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // When the menu is taller than the screen, say so: a "More below" hint that scrolls to the rest.
  const contentRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => { el.removeEventListener("scroll", check); window.removeEventListener("resize", check); };
  }, []);
  const renderItem = (it: NavItem) => {
    const Icon = ICONS[it.icon];
    return (
      <SidebarMenuItem key={it.href}>
        <SidebarMenuButton asChild isActive={active(it.href)} tooltip={it.label} className="relative h-9 data-[active=true]:before:absolute data-[active=true]:before:inset-y-1 data-[active=true]:before:left-0 data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-full data-[active=true]:before:bg-white group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:before:hidden">
          <Link href={it.href}>
            <Icon aria-hidden />
            <span>{it.label}</span>
          </Link>
        </SidebarMenuButton>
        {!!it.badge && <SidebarMenuBadge className="tabular-nums text-white/90">{it.badge}</SidebarMenuBadge>}
      </SidebarMenuItem>
    );
  };
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center">
        <Link href="/dashboard" className="flex items-center gap-3 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-white/80 text-caption font-semibold text-white">MHF</span>
          <span className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-ui font-semibold text-white">Muslim Health Foundation</span>
            <span className="text-caption text-white/60">Bhatkal</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent ref={contentRef} className="gap-0">
        {groups.map((g, i) => (
          <SidebarGroup key={g.label ?? i} className="py-1">
            {g.label && <SidebarGroupLabel className="h-7 text-caption text-white/60">{g.label}</SidebarGroupLabel>}
            <SidebarMenu>{g.items.map(renderItem)}</SidebarMenu>
          </SidebarGroup>
        ))}
        {more && (
          <div className="sticky bottom-0 mt-auto flex justify-center bg-gradient-to-t from-sidebar via-sidebar/90 to-transparent pb-2 pt-6">
            <button
              type="button"
              onClick={() => contentRef.current?.scrollBy({ top: 240, behavior: "smooth" })}
              className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-caption text-white hover:bg-white/25 group-data-[collapsible=icon]:px-1.5"
            >
              <span className="group-data-[collapsible=icon]:hidden">More below</span>
              <ChevronDown aria-hidden className="size-4" />
            </button>
          </div>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>{footer.map(renderItem)}</SidebarMenu>
        <div className="flex items-center gap-2 rounded-control px-2 py-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
          <span title={`${user.name} · ${user.role}`} className="grid size-8 shrink-0 place-items-center rounded-full bg-white/15 text-caption font-semibold text-white">
            {user.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </span>
          <span className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-ui text-white">{user.name}</span>
            <span className="block truncate text-caption text-white/60">{user.role}</span>
          </span>
          <Link href="/account/password" className="grid size-9 place-items-center rounded-control text-white/80 hover:bg-white/10" aria-label="Change password" title="Change password">
            <KeyRound aria-hidden className="size-4" />
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="grid size-9 place-items-center rounded-control text-white/80 hover:bg-white/10" aria-label="Sign out" title="Sign out">
              <LogOut aria-hidden className="size-4" />
            </button>
          </form>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
