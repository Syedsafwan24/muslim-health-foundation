import type { Metadata } from "next";
import type { AuditAction } from "@prisma/client";
import { ScrollText } from "lucide-react";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listAudit, masterOptions } from "@/lib/db/queries/admin";
import { readParams, type SearchParams } from "@/lib/params";
import { fmtDateTime } from "@/lib/fy";
import { AUDIT_ACTION, options } from "@/lib/labels";
import { EmptyState, Pill, PageHeader } from "@/components/app/bits";
import { DataTable } from "@/components/app/data-table";
import { FilterBar } from "@/components/app/filter-bar";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Activity log" };

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePage("audit.read");
  const p = await readParams(searchParams);
  const [data, m] = await Promise.all([
    listAudit(ctx, {
      action: p.oneOf("action", Object.keys(AUDIT_ACTION) as AuditAction[]),
      actorId: p.str("actor"),
      entity: p.str("entity"),
      q: p.str("q"),
      from: p.date("from"),
      to: p.dateEnd("to"),
      page: p.page(),
    }),
    masterOptions(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Activity log" meta={<>Who did what, and when. Nothing here can be edited or deleted.</>} />
      <div className="flex items-center justify-end">
        {can(ctx, "audit.export") && <Button variant="outline" asChild><a href="/api/export/audit?format=xlsx" download>Export to Excel</a></Button>}
      </div>
      <FilterBar
        filters={[
          { name: "q", label: "Search", type: "search", placeholder: "Case number, voucher or text" },
          { name: "action", label: "Action", type: "select", options: options(AUDIT_ACTION) },
          { name: "actor", label: "Who", type: "select", options: m.users.map((u) => ({ value: u.id, label: u.name })) },
          { name: "entity", label: "Record", type: "select", options: ["Application", "Person", "Payment", "Donation", "Donor", "Expense", "Attachment", "Fund", "User", "Setting", "Hospital", "Export"].map((e) => ({ value: e, label: e })) },
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
        ]}
        presets={[{ label: "Identity reveals", query: "?action=REVEAL_IDENTITY" }, { label: "Meeting mode", query: "?action=MEETING_MODE_TOGGLE" }, { label: "Exports", query: "?action=EXPORT" }]}
      />
      <DataTable
        caption="Audit log"
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        columns={[
          { id: "at", header: "When", hideable: false },
          { id: "actor", header: "Who" },
          { id: "action", header: "Action" },
          { id: "entity", header: "Record" },
          { id: "summary", header: "What happened" },
          { id: "ip", header: "IP" },
        ]}
        rows={data.rows.map((r) => ({
          id: r.id,
          tone: r.action === "REVEAL_IDENTITY" ? "alert" : undefined,
          cells: {
            at: <time className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</time>,
            actor: r.actor,
            action: r.action === "REVEAL_IDENTITY" ? <Pill tone="redacted">{AUDIT_ACTION[r.action]}</Pill> : AUDIT_ACTION[r.action],
            entity: r.entity,
            summary: r.summary === null ? <span className="text-redacted">Hidden in meeting mode</span> : <span>{r.summary}{r.reason && <span className="block text-caption text-slate-body">Reason: {r.reason}</span>}</span>,
            ip: <span className="font-mono text-caption">{r.ipAddress ?? "—"}</span>,
          },
        }))}
        empty={<EmptyState icon={ScrollText}>No actions match these filters.</EmptyState>}
      />
    </div>
  );
}
