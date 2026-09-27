import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getHospital } from "@/lib/db/queries/analytics";
import { caseBreakdown } from "@/lib/db/queries/breakdown";
import { HOSPITAL_TYPE } from "@/lib/labels";
import { readParams, type SearchParams } from "@/lib/params";
import { Field, PageHeader, Pill, SheetPanel } from "@/components/app/bits";
import { BreakdownView } from "@/components/app/breakdown-view";
import { ExportButton } from "@/components/app/export-button";
import { HospitalDialog } from "../hospital-dialog";

export const metadata: Metadata = { title: "Hospital" };

export default async function HospitalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const ctx = await getViewContext();
  const { id } = await params;
  const tab = (await readParams(searchParams)).oneOf("tab", ["cases", "patients", "payments"] as const) ?? "cases";
  const [h, d] = await Promise.all([getHospital(id), caseBreakdown(ctx, { hospitalId: id })]);
  if (!h) notFound();
  return (
    <>
      <PageHeader
        back={{ href: "/hospitals", label: "Hospitals" }}
        title={h.name}
        meta={<>{HOSPITAL_TYPE[h.type]}{h.city ? ` · ${h.city}` : ""}{h.isEmpanelled && <Pill tone="approved">Empanelled</Pill>}{!h.isActive && <Pill tone="slate">Inactive</Pill>}</>}
        actions={<>
          {can(ctx, "reports.export") && <ExportButton name="hospital" params={{ id }} />}
          {can(ctx, "hospitals.write") && (
          <HospitalDialog initial={{
            id: h.id, name: h.name, type: h.type, addressLine: h.street ?? "", city: h.city ?? "", state: h.state ?? "", phone: h.phone ?? "",
            contactPerson: h.contactPerson ?? "", contactPhone: h.contactPhone ?? "", email: h.email ?? "", isEmpanelled: h.isEmpanelled,
            discountNote: h.discountNote ?? "", bankName: h.bankName ?? "", bankAccountLast4: h.bankAccountLast4 ?? "", isActive: h.isActive, notes: h.notes ?? "",
          }} />
          )}
        </>}
      />
      <SheetPanel title="Hospital details" className="mb-6">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Address">{[h.street, h.city, h.state].filter(Boolean).join(", ")}</Field>
          <Field label="Phone">{h.phone}</Field>
          <Field label="Contact person">{[h.contactPerson, h.contactPhone].filter(Boolean).join(" · ")}</Field>
          <Field label="Email">{h.email}</Field>
          <Field label="Bank">{h.bankName ? `${h.bankName}${h.bankAccountLast4 ? ` · ending ${h.bankAccountLast4}` : ""}` : null}</Field>
          <Field label="Discount arrangement">{h.discountNote}</Field>
          <Field label="Notes">{h.notes}</Field>
        </dl>
      </SheetPanel>
      <BreakdownView
        d={d}
        basePath={`/hospitals/${id}`}
        tab={tab}
        show={{ disease: true, hospital: false }}
        donut={{ title: "By category", data: d.byCategory }}
        slices={[
          { title: "By disease", data: d.byDisease },
          { title: "By category", data: d.byCategory },
          { title: "By gender", data: d.byGender },
          { title: "By age", data: d.byAge },
          { title: "By city", data: d.byCity },
        ]}
      />
    </>
  );
}
