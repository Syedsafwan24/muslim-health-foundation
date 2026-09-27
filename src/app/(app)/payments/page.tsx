import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listPayments, paymentFilters } from "@/lib/db/queries/payments";
import { masterOptions } from "@/lib/db/queries/admin";
import { readParams, type SearchParams } from "@/lib/params";
import { fmtDate } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import { AMOUNT_BANDS, options, PAYMENT_MODE, PAYMENT_STATUS, TOWARDS } from "@/lib/labels";
import { EmptyState, MoneyText, PageHeader, PaymentStatusBadge, Pill, StatCard } from "@/components/app/bits";
import { CaseNo } from "@/components/app/inputs";
import { DataTable } from "@/components/app/data-table";
import { ExportButton } from "@/components/app/export-button";
import { FilterBar } from "@/components/app/filter-bar";
import { BulkClear } from "./bulk-clear";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePage("payments.read");
  const p = await readParams(searchParams);
  const [data, m] = await Promise.all([listPayments(ctx, { ...paymentFilters(p, ctx), page: p.page() }), masterOptions()]);
  const canWrite = can(ctx, "payments.write");
  const s = data.stats;

  return (
    <>
      <PageHeader
        title="Payments"
        meta={<>Every cheque and transfer paid out</>}
        actions={can(ctx, "reports.export") && <ExportButton name="payments" />}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total paid out" value={formatINR(s.paidPaise)} delta="Excluding cancelled and bounced" rule="approved" />
        <StatCard label="Cheques not yet cleared" value={s.unclearedCount.toLocaleString("en-IN")} delta={formatINR(s.unclearedPaise)} rule="pending" />
        <StatCard label="Payments" value={s.count.toLocaleString("en-IN")} rule="info" />
        <StatCard label="Bounced or cancelled" value={s.failedCount.toLocaleString("en-IN")} />
      </div>
      <FilterBar
        filters={[
          { name: "q", label: "Search", type: "search", placeholder: "Voucher, cheque no., UTR or case number" },
          { name: "status", label: "Status", type: "select", options: options(PAYMENT_STATUS) },
          { name: "hospital", label: "Hospital", type: "select", options: m.hospitals.map((h) => ({ value: h.id, label: h.label })) },
          { name: "amount", label: "Amount", type: "select", options: Object.entries(AMOUNT_BANDS).map(([value, b]) => ({ value, label: b.label })) },
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
        ]}
      />
      <DataTable
        caption="Payments"
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        columns={[
          { id: "voucher", header: "Voucher", sortKey: "voucher", hideable: false },
          { id: "date", header: "Date", sortKey: "date", hideable: false },
          { id: "case", header: "Case", sortKey: "case", hideable: false },
          { id: "payee", header: "Payee", sortKey: "payee", hideable: false },
          { id: "mode", header: "Mode", sortKey: "mode", hideable: false },
          { id: "ref", header: "Cheque / ref", sortKey: "ref", hideable: false },
          { id: "towards", header: "Towards", sortKey: "towards", hideable: false },
          { id: "amount", header: "Amount", align: "right", sortKey: "amount", hideable: false },
          { id: "status", header: "Status", sortKey: "status", hideable: false },
        ]}
        rows={data.rows.map((r) => ({
          id: r.id,
          href: `/payments/${r.id}`,
          selectable: r.status === "ISSUED" || r.status === "PENDING",
          tone: r.status === "BOUNCED" ? "alert" : r.status === "CANCELLED" || r.reversed ? "muted" : undefined,
          cells: {
            voucher: <span className="whitespace-nowrap font-mono text-mono-sm">{r.voucherNo}</span>,
            date: <time>{fmtDate(r.paymentDate)}</time>,
            case: <CaseNo value={r.caseNo} />,
            payee: r.hospitalName ?? r.payeeName ?? (ctx.meetingMode ? <span className="text-redacted">Hidden</span> : "—"),
            mode: PAYMENT_MODE[r.mode],
            ref: <span className="font-mono text-mono-sm">{r.chequeNo ?? r.referenceNo ?? "—"}</span>,
            towards: <span className="whitespace-nowrap">{TOWARDS[r.towards]}</span>,
            amount: <MoneyText paise={r.amountPaise} className="font-mono" />,
            status: (
              <span className="flex flex-wrap gap-1">
                <PaymentStatusBadge status={r.status} />
                {r.isReversal && <Pill tone="slate">Reversal</Pill>}
                {r.reversed && <Pill tone="rejected">Reversed</Pill>}
              </span>
            ),
          },
        }))}
        footer={<>{data.total.toLocaleString("en-IN")} payments · {formatINR(data.totalPaise)} paid out (excluding cancelled and bounced)</>}
        empty={<EmptyState icon={Banknote}>No payments match. Payments are recorded from an approved case.</EmptyState>}
        bulk={canWrite ? <BulkClear /> : undefined}
      />
    </>
  );
}
