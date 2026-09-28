import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/context";
import { can, ROLE_LABEL } from "@/lib/auth/permissions";
import { listUsers } from "@/lib/db/queries/admin";
import { fmtDateTime } from "@/lib/fy";
import { Pill, SheetPanel } from "@/components/app/bits";
import { UserDialog } from "../settings-forms";

export const metadata: Metadata = { title: "Users" };

export default async function UsersSettings() {
  const ctx = await requirePage("users.manage");
  const users = await listUsers(ctx);
  const manage = can(ctx, "users.manage");
  const th = "px-3 py-2.5 text-label font-medium";
  return (
    <div className="space-y-6">
      <SheetPanel title="Users" bodyClassName="p-0" action={manage && <UserDialog />}>
        <table className="w-full text-ui">
          <thead className="bg-navy-700 text-left text-white"><tr><th className={th}>Name</th><th className={th}>Email</th><th className={th}>Job</th><th className={th}>Status</th><th className={th}>Last sign-in</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`h-[var(--row-h)] border-b border-rule ${u.isActive ? "" : "text-slate-body"}`}>
                <td className="px-3 font-medium">{u.name}</td>
                <td className="px-3">{u.email}</td>
                <td className="px-3">{ROLE_LABEL[u.role]}</td>
                <td className="px-3 space-x-1">
                  {u.isActive ? <Pill tone="approved">Active</Pill> : <Pill tone="slate">Deactivated</Pill>}
                  {u.forceMeetingMode && <Pill tone="redacted">Names hidden</Pill>}
                  {u.locked && <Pill tone="rejected">Locked out</Pill>}
                </td>
                <td className="px-3">{fmtDateTime(u.lastLoginAt)}</td>
                <td className="px-3 text-right">{manage && <UserDialog user={u} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SheetPanel>
    </div>
  );
}
