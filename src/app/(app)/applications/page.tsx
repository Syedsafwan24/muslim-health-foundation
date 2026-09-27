import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { getViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listApplications } from "@/lib/db/queries/applications";
import { applicationFilters } from "@/lib/filters/applications";
import { masterOptions } from "@/lib/db/queries/admin";
import { readParams, type SearchParams } from "@/lib/params";
import { fmtDate } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import { AMOUNT_BANDS, GENDER, options } from "@/lib/labels";
import { AliasChip, EmptyState, MoneyText, PageHeader, Pill, StatCard, StatusBadge } from "@/components/app/bits";
import { ExportButton } from "@/components/app/export-button";
import { CaseNo } from "@/components/app/inputs";
import { DataTable } from "@/components/app/data-table";
import { FilterBar } from "@/components/app/filter-bar";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getViewContext();
  const p = await readParams(searchParams);
  const filters = applicationFilters(p, ctx);
  const [data, m] = await Promise.all([
    listApplications(ctx, filters),
    masterOptions(),
  ]);
  const filtered = ["q", "status", "hospital", "disease", "category", "gender", "amount", "from", "to"].some((k) => p.str(k));
  const canCreate = can(ctx, "applications.write") && !ctx.meetingMode;

  return (
    <>
      <PageHeader
        title="Applications"
        meta={<>FY {filters.fy ?? "all years"}</>}
        actions={<>
          {can(ctx, "reports.export") && <ExportButton name="applications" />}
          {canCreate && (
            <Button asChild>
              <Link href="/applications/new"><Plus aria-hidden /> New application</Link>
            </Button>
          )}
        </>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Cases · ${data.totals.patients.toLocaleString("en-IN")} patients`} value={data.total.toLocaleString("en-IN")} />
        <StatCard label="Approved" value={formatINR(data.totals.approved)} rule="info" />
        <StatCard label="Paid" value={formatINR(data.totals.paid)} rule="approved" />
        <StatCard label="Approved, not paid yet" value={data.totals.notPaidYet.toLocaleString("en-IN")} rule="pending" />
      </div>
      <FilterBar
        filters={[
          { name: "q", label: "Search", type: "search", placeholder: ctx.meetingMode ? "Case number or person code" : "Case number, name, mobile or person code" },
          { name: "status", label: "Status", type: "select", options: [{ value: "DRAFT", label: "Draft" }, { value: "APPROVED,PARTIALLY_APPROVED,PAYMENT_PENDING", label: "Not paid yet" }, { value: "PAID,CLOSED", label: "Paid" }] },
          { name: "hospital", label: "Hospital", type: "select", options: m.hospitals.map((h) => ({ value: h.id, label: h.label })) },
          { name: "disease", label: "Major problem", type: "select", options: m.categories.flatMap((c) => c.diseases.map((d) => ({ value: d.id, label: `${d.name} (${c.name})` }))) },
          { name: "category", label: "Category", type: "select", options: m.categories.map((c) => ({ value: c.id, label: c.name })) },
          { name: "gender", label: "Gender", type: "select", options: options(GENDER) },
          { name: "amount", label: "Approved amount", type: "select", options: Object.entries(AMOUNT_BANDS).map(([value, b]) => ({ value, label: b.label })) },
          { name: "from", label: "From", type: "date" },
          { name: "to", label: "To", type: "date" },
        ]}
      />
      <DataTable
        caption="Applications"
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        columns={[
          { id: "caseNo", header: "Case no", sortKey: "caseNo", hideable: false },
          { id: "date", header: "Date", sortKey: "date", hideable: false },
          { id: "patient", header: "Patient", sortKey: "patient", hideable: false },
          { id: "gender", header: "Gender", sortKey: "gender", hideable: false },
          { id: "age", header: "Age", align: "right", sortKey: "age", hideable: false },
          { id: "disease", header: "Major problem", sortKey: "disease", hideable: false },
          { id: "hospital", header: "Hospital", sortKey: "hospital", hideable: false },
          { id: "approved", header: "Approved (INR)", align: "right", sortKey: "approved", hideable: false },
          { id: "paid", header: "Paid", align: "right", hideable: false },
          { id: "status", header: "Status", sortKey: "status", hideable: false },
        ]}
        rows={data.rows.map((a) => ({
          id: a.id,
          href: `/applications/${a.id}`,
          cells: {
            caseNo: <span className="whitespace-nowrap"><CaseNo value={a.caseNo} /></span>,
            date: <time>{fmtDate(a.applicationDate)}</time>,
            patient: a.patient.isRedacted ? (
              <AliasChip code={a.patient.personCode} />
            ) : (
              <span className="flex items-center gap-2">
                {a.patient.displayName}
                {a.watchFlag && <Pill tone="pending">Watch</Pill>}
              </span>
            ),
            gender: a.gender ? GENDER[a.gender] : "—",
            age: a.age ?? "—",
            disease: a.diseaseName ?? "—",
            hospital: a.hospitalName ?? "—",
            approved: <MoneyText paise={a.approvedPaise} className="font-mono" />,
            paid: <MoneyText paise={a.paidPaise || null} className="font-mono" />,
            status: (
              <span className="flex flex-wrap items-center gap-1">
                <StatusBadge status={a.status} />
              </span>
            ),
          },
        }))}
        footer={<>{data.total.toLocaleString("en-IN")} cases · {formatINR(data.totals.approved)} approved · {formatINR(data.totals.paid)} paid</>}
        empty={
          <EmptyState icon={ClipboardList} action={canCreate && !filtered ? <Button asChild><Link href="/applications/new">New application</Link></Button> : undefined}>
            {filtered ? "No cases match these filters. Clear a filter to see more." : "No cases yet this year. Record the first application."}
          </EmptyState>
        }
      />
    </>
  );
}
