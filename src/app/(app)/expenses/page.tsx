import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { expenseFilters, listExpenses } from "@/lib/db/queries/donations";
import { activeFunds } from "@/lib/db/queries/funds";
import { readParams, type SearchParams } from "@/lib/params";
import { fmtDate } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import { AMOUNT_BANDS, EXPENSE_CATEGORY, options, PAYMENT_MODE } from "@/lib/labels";
import { EmptyState, MoneyText, PageHeader, SheetPanel, StatCard } from "@/components/app/bits";
import { DataTable } from "@/components/app/data-table";
import { ExportButton } from "@/components/app/export-button";
import { FilterBar } from "@/components/app/filter-bar";
import { HBars } from "@/components/app/charts";
import { ExpenseDialog } from "./expense-dialog";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePage("expenses.read");
  const p = await readParams(searchParams);
  const f = expenseFilters(p, ctx);
  const [funds, data] = await Promise.all([activeFunds("expense"), listExpenses(ctx, { ...f, page: p.page() })]);

  // Zakat cannot pay running costs (open question 2). With no expense fund, there is nothing to record against.
  if (!funds.length && data.total === 0) {
    return (
      <>
        <PageHeader title="Expenses" meta={<>The trust&apos;s own running costs</>} />
        <SheetPanel rule="pending">
          <EmptyState icon={Receipt} action={can(ctx, "funds.write") ? <Link href="/funds" className="text-info hover:underline">Open funds</Link> : undefined}>
            No fund is available for expenses yet. Add a non-Zakat fund in Settings to record administrative costs.
          </EmptyState>
        </SheetPanel>
      </>
    );
  }

  const s = data.stats;
  return (
    <>
      <PageHeader
        title="Expenses"
        meta={<>The trust&apos;s own running costs{f.fy ? <>, FY {f.fy}</> : null}</>}
        actions={<>
          {can(ctx, "reports.export") && <ExportButton name="expenses" />}
          {can(ctx, "expenses.write") && funds.length > 0 && <ExpenseDialog funds={funds.map((x) => ({ id: x.id, name: x.name }))} />}
        </>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Spent" value={formatINR(s.spentPaise)} rule="approved" />
        <StatCard label="Expenses" value={s.count.toLocaleString("en-IN")} rule="info" />
        <StatCard label="Top category" value={s.top ? EXPENSE_CATEGORY[s.top.category] : "—"} delta={s.top ? formatINR(s.top.paise) : undefined} rule="pending" />
        <StatCard label="Average expense" value={formatINR(s.averagePaise)} />
      </div>
      {data.byCategory.length > 0 && (
        <SheetPanel title="By category" className="mb-6">
          <HBars data={data.byCategory.map((c) => ({ name: EXPENSE_CATEGORY[c.category], amount: c.amount }))} label="Bar chart of expenses by category" />
        </SheetPanel>
      )}
      <FilterBar
        filters={[
          { name: "q", label: "Search", type: "search", placeholder: "Voucher, description, paid to or reference" },
          { name: "category", label: "Category", type: "select", options: options(EXPENSE_CATEGORY) },
          ...(funds.length > 1 ? [{ name: "fund", label: "Fund", type: "select" as const, options: funds.map((x) => ({ value: x.id, label: x.name })) }] : []),
          { name: "mode", label: "Mode", type: "select", options: options(PAYMENT_MODE) },
          { name: "amount", label: "Amount", type: "select", options: Object.entries(AMOUNT_BANDS).map(([value, b]) => ({ value, label: b.label })) },
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
        ]}
      />
      <DataTable
        caption="Expenses"
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        columns={[
          { id: "voucher", header: "Voucher", sortKey: "voucher", hideable: false },
          { id: "date", header: "Date", sortKey: "date", hideable: false },
          { id: "category", header: "Category", sortKey: "category", hideable: false },
          { id: "description", header: "Description", sortKey: "description", hideable: false },
          { id: "paidTo", header: "Paid to", sortKey: "paidTo", hideable: false },
          { id: "mode", header: "Mode", sortKey: "mode", hideable: false },
          { id: "fund", header: "Fund", sortKey: "fund", hideable: false },
          { id: "amount", header: "Amount", align: "right", sortKey: "amount", hideable: false },
        ]}
        rows={data.rows.map((e) => ({
          id: e.id,
          cells: {
            voucher: <span className="font-mono text-mono-sm">{e.voucherNo}</span>,
            date: <time>{fmtDate(e.expenseDate)}</time>,
            category: EXPENSE_CATEGORY[e.category],
            description: e.description,
            paidTo: e.paidTo ?? "—",
            mode: PAYMENT_MODE[e.mode],
            fund: e.fundName,
            amount: <MoneyText paise={e.amountPaise} className="font-mono" />,
          },
        }))}
        footer={<>{data.total.toLocaleString("en-IN")} expenses · {formatINR(s.spentPaise)} spent</>}
        empty={<EmptyState icon={Receipt}>No expenses match. Clear the filters, or record the first expense.</EmptyState>}
      />
    </>
  );
}
