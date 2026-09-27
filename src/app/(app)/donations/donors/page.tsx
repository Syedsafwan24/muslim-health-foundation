import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { donorFilters, listDonors } from "@/lib/db/queries/donations";
import { readParams, type SearchParams } from "@/lib/params";
import { fmtDate } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import { AMOUNT_BANDS, DONOR_TYPE, options } from "@/lib/labels";
import { EmptyState, MoneyText, PageHeader, StatCard } from "@/components/app/bits";
import { DataTable } from "@/components/app/data-table";
import { ExportButton } from "@/components/app/export-button";
import { FilterBar } from "@/components/app/filter-bar";
import { DonorDialog } from "../donation-forms";
import { DonationTabs } from "../tabs";

export const metadata: Metadata = { title: "Donors" };

export default async function DonorsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePage("donations.read");
  const p = await readParams(searchParams);
  const f = donorFilters(p);
  const data = await listDonors(ctx, { ...f, page: p.page() });
  const s = data.stats;
  const period = !!(f.from || f.to);
  return (
    <>
      <PageHeader
        title="Donations"
        meta={<>Donor registry · lifetime giving</>}
        actions={<>
          {can(ctx, "reports.export") && <ExportButton name="donors" />}
          {can(ctx, "donations.write") && <DonorDialog />}
        </>}
      />
      <DonationTabs active="donors" showFunds={can(ctx, "funds.read")} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Donors" value={s.donors.toLocaleString("en-IN")} rule="info" />
        <StatCard label={`Donated in FY ${ctx.fy}`} value={formatINR(s.fyPaise)} rule="zakat" />
        <StatCard label="Anonymous donors" value={s.anonymous.toLocaleString("en-IN")} />
        <StatCard label="Average gift" value={formatINR(s.averagePaise)} delta={period ? "In the selected dates" : "Lifetime, excluding cancelled"} rule="approved" />
      </div>
      <FilterBar
        filters={[
          { name: "q", label: "Search", type: "search", placeholder: "Donor name, code or phone" },
          { name: "type", label: "Type", type: "select", options: options(DONOR_TYPE) },
          { name: "amount", label: period ? "Given in dates" : "Lifetime given", type: "select", options: Object.entries(AMOUNT_BANDS).map(([value, b]) => ({ value, label: b.label })) },
          { name: "from", label: "Gave from", type: "date" },
          { name: "to", label: "Gave to", type: "date" },
        ]}
      />
      <DataTable
        caption="Donors"
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        columns={[
          { id: "code", header: "Code", sortKey: "code", hideable: false },
          { id: "name", header: "Donor", sortKey: "name", hideable: false },
          { id: "type", header: "Type", sortKey: "type", hideable: false },
          { id: "city", header: "City", sortKey: "city", hideable: false },
          { id: "count", header: "Donations", align: "right", sortKey: "count", hideable: false },
          { id: "last", header: "Last donation", sortKey: "last", hideable: false },
          { id: "total", header: period ? "Given in dates" : "Lifetime given", align: "right", sortKey: "total", hideable: false },
        ]}
        rows={data.rows.map((d) => ({
          id: d.id,
          href: `/donations/donors/${d.id}`,
          cells: {
            code: <span className="font-mono text-mono-sm">{d.donorCode}</span>,
            name: <span className="font-medium">{d.name}</span>,
            type: DONOR_TYPE[d.type],
            city: d.city ?? "—",
            count: d.count,
            last: d.lastDonationAt ? <time>{fmtDate(d.lastDonationAt)}</time> : "—",
            total: <MoneyText paise={d.lifetimePaise} className="font-mono" />,
          },
        }))}
        empty={<EmptyState icon={Users}>No donors match. Clear the filters, or add the first donor.</EmptyState>}
      />
    </>
  );
}
