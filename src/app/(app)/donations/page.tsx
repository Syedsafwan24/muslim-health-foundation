import type { Metadata } from "next";
import { HandCoins } from "lucide-react";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { donationFilters, donorOptions, listDonations } from "@/lib/db/queries/donations";
import { activeFunds } from "@/lib/db/queries/funds";
import { masterOptions } from "@/lib/db/queries/admin";
import { readParams, type SearchParams } from "@/lib/params";
import { fmtDate } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import { AMOUNT_BANDS, options, PAYMENT_MODE } from "@/lib/labels";
import { EmptyState, MoneyText, PageHeader, Pill, StatCard } from "@/components/app/bits";
import { DataTable } from "@/components/app/data-table";
import { ExportButton } from "@/components/app/export-button";
import { FilterBar } from "@/components/app/filter-bar";
import { DonationDialog } from "./donation-forms";
import { DonationTabs } from "./tabs";

export const metadata: Metadata = { title: "Donations" };

export default async function DonationsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePage("donations.read");
  const p = await readParams(searchParams);
  const canWrite = can(ctx, "donations.write");
  const [data, funds, donors, m] = await Promise.all([
    listDonations(ctx, { ...donationFilters(p, ctx), page: p.page() }),
    activeFunds("donation"),
    canWrite ? donorOptions(ctx) : Promise.resolve([]),
    canWrite ? masterOptions() : Promise.resolve(null),
  ]);
  const s = data.stats;
  return (
    <>
      <PageHeader
        title="Donations"
        meta={<>Money in, FY {p.fy() ?? ctx.fy}</>}
        actions={<>
          {can(ctx, "reports.export") && <ExportButton name="donations" />}
          {canWrite && m && <DonationDialog donors={donors} funds={funds.map((f) => ({ id: f.id, name: f.name }))} banks={m.banks} />}
        </>}
      />
      <DonationTabs active="entries" showFunds={can(ctx, "funds.read")} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Received" value={formatINR(s.receivedPaise)} delta={`${data.total.toLocaleString("en-IN")} ${data.total === 1 ? "entry" : "entries"}, excluding cancelled`} rule="approved" />
        <StatCard label="Zakat" value={formatINR(s.zakatPaise)} rule="zakat" />
        <StatCard label="General and other funds" value={formatINR(s.otherPaise)} rule="info" />
        <StatCard label="Receipts not yet issued" value={s.receiptsPending.toLocaleString("en-IN")} rule="pending" />
      </div>
      <FilterBar
        filters={[
          { name: "q", label: "Search", type: "search", placeholder: "Receipt no., donor or reference" },
          ...(funds.length > 1 ? [{ name: "fund", label: "Fund", type: "select" as const, options: funds.map((f) => ({ value: f.id, label: f.name })) }] : []),
          { name: "mode", label: "Mode", type: "select", options: options(PAYMENT_MODE) },
          { name: "amount", label: "Amount", type: "select", options: Object.entries(AMOUNT_BANDS).map(([value, b]) => ({ value, label: b.label })) },
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
        ]}
      />
      <DataTable
        caption="Donations"
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        columns={[
          { id: "receipt", header: "Receipt no", sortKey: "receipt", hideable: false },
          { id: "date", header: "Date", sortKey: "date", hideable: false },
          { id: "donor", header: "Donor", sortKey: "donor", hideable: false },
          ...(funds.length > 1 ? [{ id: "fund", header: "Fund", sortKey: "fund", hideable: false }] : []),
          { id: "mode", header: "Mode", sortKey: "mode", hideable: false },
          { id: "ref", header: "Reference", sortKey: "ref", hideable: false },
          { id: "amount", header: "Amount", align: "right" as const, sortKey: "amount", hideable: false },
        ]}
        rows={data.rows.map((d) => ({
          id: d.id,
          href: `/donations/${d.id}`,
          tone: d.cancelled ? "muted" : undefined,
          cells: {
            receipt: <span className="font-mono text-mono-sm">{d.receiptNo}{d.cancelled && <Pill tone="rejected" className="ml-2">Cancelled</Pill>}</span>,
            date: <time>{fmtDate(d.donationDate)}</time>,
            donor: d.donorName,
            fund: d.fundName,
            mode: PAYMENT_MODE[d.mode],
            ref: <span className="font-mono text-mono-sm">{d.chequeNo ?? d.referenceNo ?? "—"}</span>,
            amount: <MoneyText paise={d.amountPaise} className={d.cancelled ? "font-mono line-through" : "font-mono"} />,
          },
        }))}
        footer={<>{data.total.toLocaleString("en-IN")} entries · {formatINR(data.totalPaise)} received (excluding cancelled)</>}
        empty={<EmptyState icon={HandCoins}>No donations recorded for this period. Record the first donation.</EmptyState>}
      />
    </>
  );
}
