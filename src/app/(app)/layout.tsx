import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar, type NavGroup, type NavItem } from "@/components/app/app-sidebar";
import { MeetingModeBanner, Topbar } from "@/components/app/topbar";
import { getSignedIn } from "@/lib/auth/context";
import { can, ROLE_LABEL } from "@/lib/auth/permissions";
import { listFiscalYears } from "@/lib/db/queries/fiscal-years";
import { shellCounts } from "@/lib/db/queries/admin";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSignedIn();
  if (!s) redirect("/login");
  // Forced password change: no navigation, no counts. /account/password renders here; every other
  // page redirects there itself through getViewContext/requirePage, and actions refuse to run.
  if (s.mustChangePassword) return <main id="main" className="min-h-dvh bg-paper px-4 py-10">{children}</main>;
  const ctx = s.ctx;
  const counts = await shellCounts(ctx);
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  const groups: NavGroup[] = [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/applications", label: "Applications", icon: "applications", badge: counts.applicationsBadge },
        { href: "/patients", label: "Patients", icon: "patients" },
        { href: "/applicants", label: "Applicants", icon: "applicants" },
      ] satisfies NavItem[],
    },
    {
      label: "Money",
      items: [
        can(ctx, "payments.read") && { href: "/payments", label: "Payments", icon: "payments", badge: counts.paymentsBadge },
        can(ctx, "donations.read") && { href: "/donations", label: "Donations", icon: "donations" },
        can(ctx, "expenses.read") && { href: "/expenses", label: "Expenses", icon: "expenses" },
        can(ctx, "funds.read") && { href: "/funds", label: "Funds", icon: "funds" },
      ].filter(Boolean) as NavItem[],
    },
    {
      label: "Records",
      items: [
        { href: "/hospitals", label: "Hospitals", icon: "hospitals" },
        { href: "/diseases", label: "Diseases", icon: "diseases" },
        (can(ctx, "reports.operational") || can(ctx, "reports.financial")) && { href: "/reports", label: "Reports", icon: "reports" },
      ].filter(Boolean) as NavItem[],
    },
  ].filter((g) => g.items.length);
  const footer = [
    can(ctx, "audit.read") && { href: "/activity", label: "Activity log", icon: "activity" },
    can(ctx, "settings.read") && { href: "/settings", label: "Settings", icon: "settings" },
    { href: "/account/password", label: "Change password", icon: "password" },
  ].filter(Boolean) as NavItem[];

  const bannerReason = ctx.meetingMode ? (ctx.globalMeetingMode ? "global" : "account") : null;

  return (
    <SidebarProvider defaultOpen={sidebarOpen} style={{ "--sidebar-width": "16.5rem", "--sidebar-width-icon": "4.25rem" } as React.CSSProperties}>
      <AppSidebar groups={groups} footer={footer} user={{ name: ctx.name, role: ROLE_LABEL[ctx.role] }} />
      <SidebarInset className="min-w-0 bg-paper">
        <Topbar fy={ctx.fy} years={(await listFiscalYears()).map((y) => y.code)} canToggleMeetingMode={can(ctx, "meetingMode.toggle")} globalMeetingMode={ctx.globalMeetingMode} notices={counts.notices} />
        {bannerReason && <MeetingModeBanner reason={bannerReason} />}
        <main id="main" className="mx-auto w-full max-w-[1440px] px-6 py-6 lg:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
