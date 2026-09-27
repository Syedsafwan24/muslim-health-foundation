import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import type { HospitalType } from "@prisma/client";
import { getViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listHospitals } from "@/lib/db/queries/analytics";
import { readParams, type SearchParams } from "@/lib/params";
import { formatINR } from "@/lib/money";
import { HOSPITAL_TYPE, options } from "@/lib/labels";
import { EmptyState, MoneyText, PageHeader, Pill, StatCard } from "@/components/app/bits";
import { DataTable } from "@/components/app/data-table";
import { ExportButton } from "@/components/app/export-button";
import { FilterBar } from "@/components/app/filter-bar";
import { HospitalDialog } from "./hospital-dialog";

export const metadata: Metadata = { title: "Hospitals" };

export default async function HospitalsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getViewContext();
  const p = await readParams(searchParams);
  const rows = await listHospitals(ctx, {
    q: p.str("q"), includeInactive: p.flag("inactive"), type: p.oneOf("type", Object.keys(HOSPITAL_TYPE) as HospitalType[]), withCases: p.flag("withCases"),
  });
  const sum = (k: "cases" | "pendingCheques") => rows.reduce((s, h) => s + h[k], 0);
  return (
    <>
      <PageHeader
        title="Hospitals"
        meta={<>Cases, patients and amounts for FY {ctx.fy}</>}
        actions={<>
          {can(ctx, "reports.export") && <ExportButton name="hospitals" />}
          {can(ctx, "hospitals.write") && <HospitalDialog />}
        </>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Hospitals · ${rows.filter((h) => h.cases > 0).length} with cases this FY`} value={rows.length.toLocaleString("en-IN")} />
        <StatCard label="Cases (FY)" value={sum("cases").toLocaleString("en-IN")} />
        <StatCard label="Paid (FY)" value={formatINR(rows.reduce((s, h) => s + h.paidPaise, 0n))} rule="approved" />
        <StatCard label="Cheques not yet cleared" value={sum("pendingCheques").toLocaleString("en-IN")} rule="pending" />
      </div>
      <FilterBar
        filters={[
          { name: "q", label: "Search", type: "search", placeholder: "Hospital name or city" },
          { name: "type", label: "Type", type: "select", options: options(HOSPITAL_TYPE) },
          { name: "withCases", label: "Has cases this FY", type: "toggle" },
          { name: "inactive", label: "Show inactive", type: "toggle" },
        ]}
      />
      <DataTable
        caption="Hospitals"
        total={rows.length}
        pageSize={Math.max(rows.length, 1)}
        columns={[
          { id: "name", header: "Hospital", sortable: true, hideable: false },
          { id: "type", header: "Type", sortable: true, hideable: false },
          { id: "city", header: "City", sortable: true, hideable: false },
          { id: "cases", header: "Cases (FY)", align: "right", sortable: true, hideable: false },
          { id: "patients", header: "Patients (FY)", align: "right", sortable: true, hideable: false },
          { id: "paid", header: "Total paid (FY)", align: "right", sortable: true, hideable: false },
          { id: "pending", header: "Pending cheques", align: "right", sortable: true, hideable: false },
        ]}
        rows={rows.map((h) => ({
          id: h.id,
          href: `/hospitals/${h.id}`,
          tone: h.isActive ? undefined : "muted",
          sort: { name: h.name, type: HOSPITAL_TYPE[h.type], city: h.city, cases: h.cases, patients: h.patients, paid: Number(h.paidPaise), pending: h.pendingCheques },
          cells: {
            name: <span className="flex items-center gap-2 font-medium">{h.name}{h.isEmpanelled && <Pill tone="approved">Empanelled</Pill>}{!h.isActive && <Pill tone="slate">Inactive</Pill>}</span>,
            type: HOSPITAL_TYPE[h.type],
            city: h.city ?? "—",
            cases: h.cases,
            patients: h.patients,
            paid: <MoneyText paise={h.paidPaise} className="font-mono" />,
            pending: h.pendingCheques || "—",
          },
        }))}
        empty={<EmptyState icon={Building2}>No hospitals match. Add the hospital when you record an application.</EmptyState>}
      />
    </>
  );
}
