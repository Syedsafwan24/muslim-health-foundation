import { getViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/app/bits";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getViewContext();
  const all = can(ctx, "settings.read");
  const tabs = [
    all && { href: "/settings", label: "Organisation" },
    can(ctx, "users.manage") && { href: "/settings/users", label: "Users" },
    all && { href: "/settings/privacy", label: "Hide names" },
    all && { href: "/settings/masters", label: "Lists" },
    all && { href: "/settings/fiscal-years", label: "Fiscal years" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <>
      <PageHeader title="Settings" meta={all && !can(ctx, "settings.write") ? <>Read-only for your role</> : undefined} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <SettingsNav tabs={tabs} />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
