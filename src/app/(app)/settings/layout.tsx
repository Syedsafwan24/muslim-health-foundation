import { getViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/app/bits";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getViewContext();
  const all = can(ctx, "settings.read");
  const tabs = [
    all && { href: "/settings", label: "Organisation" },
    all && { href: "/settings/privacy", label: "Privacy and meeting mode" },
    can(ctx, "users.manage") && { href: "/settings/users", label: "Users and roles" },
    can(ctx, "funds.read") && { href: "/funds", label: "Funds" },
    all && { href: "/settings/masters", label: "Masters" },
    all && { href: "/settings/numbering", label: "Numbering" },
    all && { href: "/settings/documents", label: "Documents" },
    all && { href: "/settings/backup", label: "Backup and data" },
    can(ctx, "audit.read") && { href: "/settings/audit", label: "Audit log" },
    { href: "/settings/appearance", label: "Appearance" },
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
