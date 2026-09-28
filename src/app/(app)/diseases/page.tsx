import type { Metadata } from "next";
import { Stethoscope } from "lucide-react";
import { getViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { diseaseRows } from "@/lib/db/queries/analytics";
import { readParams, type SearchParams } from "@/lib/params";
import { formatINR } from "@/lib/money";
import { EmptyState, MoneyText, PageHeader, Pill, StatCard } from "@/components/app/bits";
import { DataTable } from "@/components/app/data-table";
import { ExportButton } from "@/components/app/export-button";
import { FilterBar } from "@/components/app/filter-bar";

export const metadata: Metadata = { title: "Diseases" };

export default async function DiseasesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getViewContext();
  const p = await readParams(searchParams);
  const { rows, categories, totals } = await diseaseRows(ctx, { q: p.str("q"), categoryId: p.str("category"), chronic: p.flag("chronic"), withCases: p.flag("withCases") });
  return (
    <>
      <PageHeader
        title="Diseases"
        meta={<>Patients, cases and amounts by disease for FY {ctx.fy}. Open a disease to see its cases. Categories are managed in Settings → Lists.</>}
        actions={can(ctx, "reports.export") && <ExportButton name="diseases" />}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Diseases · ${rows.filter((d) => d.cases > 0).length} with cases this FY`} value={rows.length.toLocaleString("en-IN")} />
        <StatCard label="Cases (FY)" value={totals.cases.toLocaleString("en-IN")} />
        <StatCard label="Patients (FY)" value={totals.patients.toLocaleString("en-IN")} />
        <StatCard label="Paid (FY)" value={formatINR(totals.paidPaise)} rule="approved" />
      </div>
      <FilterBar
        filters={[
          { name: "q", label: "Search", type: "search", placeholder: "Disease name" },
          { name: "category", label: "Category", type: "select", options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { name: "withCases", label: "Has cases this FY", type: "toggle" },
          { name: "chronic", label: "Chronic only", type: "toggle" },
        ]}
      />
      <DataTable
        caption="Diseases"
        total={rows.length}
        pageSize={Math.max(rows.length, 1)}
        columns={[
          { id: "name", header: "Disease", sortable: true, hideable: false },
          { id: "category", header: "Category", sortable: true, hideable: false },
          { id: "patients", header: "Patients (FY)", align: "right", sortable: true, hideable: false },
          { id: "cases", header: "Cases (FY)", align: "right", sortable: true, hideable: false },
          { id: "paid", header: "Total paid (FY)", align: "right", sortable: true, hideable: false },
          { id: "average", header: "Average per case", align: "right", sortable: true, hideable: false },
        ]}
        rows={rows.map((d) => ({
          id: d.id,
          href: `/diseases/${d.id}`,
          tone: d.cases ? undefined : "muted",
          sort: { name: d.name, category: d.categoryName, patients: d.patients, cases: d.cases, paid: Number(d.totalPaise), average: Number(d.averagePaise) },
          cells: {
            name: <span className="flex items-center gap-2 font-medium">{d.name}{d.isChronic && <Pill tone="info">Chronic</Pill>}</span>,
            category: d.categoryName,
            patients: d.patients,
            cases: d.cases,
            paid: <MoneyText paise={d.totalPaise} className="font-mono" />,
            average: <MoneyText paise={d.averagePaise} className="font-mono" />,
          },
        }))}
        empty={<EmptyState icon={Stethoscope}>No diseases match these filters.</EmptyState>}
      />
    </>
  );
}
