import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/context";
import { can, CAPABILITIES, ROLE_LABEL } from "@/lib/auth/permissions";
import { listUsers } from "@/lib/db/queries/admin";
import { fmtDateTime } from "@/lib/fy";
import { Pill, SheetPanel } from "@/components/app/bits";
import { UserDialog } from "../settings-forms";

export const metadata: Metadata = { title: "Users and roles" };

const ROLES = Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[];

export default async function UsersSettings() {
  const ctx = await requirePage("settings.read");
  const users = await listUsers(ctx);
  const manage = can(ctx, "users.manage");
  const th = "px-3 py-2.5 text-label font-medium";
  return (
    <div className="space-y-6">
      <SheetPanel title="Users" bodyClassName="p-0" action={manage && <UserDialog />}>
        <table className="w-full text-ui">
          <thead className="bg-navy-700 text-left text-white"><tr><th className={th}>Name</th><th className={th}>Email</th><th className={th}>Role</th><th className={th}>Status</th><th className={th}>Last sign-in</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`h-[var(--row-h)] border-b border-rule ${u.isActive ? "" : "text-slate-body"}`}>
                <td className="px-3 font-medium">{u.name}</td>
                <td className="px-3">{u.email}</td>
                <td className="px-3">{ROLE_LABEL[u.role]}</td>
                <td className="px-3 space-x-1">
                  {u.isActive ? <Pill tone="approved">Active</Pill> : <Pill tone="slate">Deactivated</Pill>}
                  {u.forceMeetingMode && <Pill tone="redacted">Always hidden</Pill>}
                  {u.locked && <Pill tone="rejected">Locked out</Pill>}
                </td>
                <td className="px-3">{fmtDateTime(u.lastLoginAt)}</td>
                <td className="px-3 text-right">{manage && <UserDialog user={u} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SheetPanel>
      <SheetPanel title="What each role can do" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-ui">
            <thead className="bg-navy-700 text-left text-white"><tr><th className={th}>Capability</th>{ROLES.map((r) => <th key={r} className={`${th} text-center`}>{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>
              {Object.entries(CAPABILITIES).map(([cap, roles]) => (
                <tr key={cap} className="border-b border-rule">
                  <td className="px-3 py-1.5 font-mono text-mono-sm">{cap}</td>
                  {ROLES.map((r) => <td key={r} className="px-3 text-center">{(roles as readonly string[]).includes(r) ? <span aria-label="yes">✓</span> : <span aria-label="no" className="text-slate-body">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SheetPanel>
    </div>
  );
}
