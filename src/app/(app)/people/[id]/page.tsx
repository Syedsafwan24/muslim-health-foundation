import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, EyeOff } from "lucide-react";
import { getViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getPerson } from "@/lib/db/queries/people";
import { masterOptions } from "@/lib/db/queries/admin";
import { fmtDate } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import { GENDER, ID_TYPE, MARITAL } from "@/lib/labels";
import { AliasChip, Field, MoneyText, PageHeader, SheetPanel, StatCard, StatusBadge } from "@/components/app/bits";
import { PersonTools } from "./person-tools";
import { DeleteButton } from "@/components/app/delete-button";

export const metadata: Metadata = { title: "Person" };

type Case = NonNullable<Awaited<ReturnType<typeof getPerson>>>["asPatient"][number];

function CaseTable({ rows, empty }: { rows: Case[]; empty: string }) {
  if (!rows.length) return <p className="px-5 py-6 text-ui text-slate-body">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-ui">
        <thead className="bg-navy-700 text-left text-white">
          <tr>{["Case no", "Date", "Disease", "Hospital", "Requested", "Paid", "Status"].map((h) => <th key={h} scope="col" className={`px-3 py-2.5 text-label font-medium ${["Requested", "Paid"].includes(h) ? "text-right" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="h-[var(--row-h)] border-b border-rule last:border-b-0">
              <td className="px-3 font-mono text-mono-sm"><Link href={`/applications/${c.id}`} className="hover:underline">{c.caseNo}</Link></td>
              <td className="px-3"><time>{fmtDate(c.applicationDate)}</time></td>
              <td className="px-3">{c.diseaseName ?? "—"}</td>
              <td className="px-3">{c.hospitalName ?? "—"}</td>
              <td className="px-3 text-right font-mono"><MoneyText paise={c.requestedPaise} /></td>
              <td className="px-3 text-right font-mono"><MoneyText paise={c.paidPaise} /></td>
              <td className="px-3"><StatusBadge status={c.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getViewContext();
  const { id } = await params;
  const d = await getPerson(ctx, id);
  if (!d) notFound();
  const p = d.person;
  const areas = !p.isRedacted && can(ctx, "people.write") ? (await masterOptions()).areas : [];

  return (
    <>
      <PageHeader
        back={{ href: "/patients", label: "Patients" }}
        title={p.isRedacted ? <AliasChip code={p.personCode} className="text-h2" /> : p.fullName}
        meta={<><span className="font-mono">{p.personCode}</span>{!p.isRedacted && p.isDeceased && <span>· Deceased</span>}</>}
        actions={!p.isRedacted ? (
          <>
            {(can(ctx, "people.write") || can(ctx, "people.merge")) && <PersonTools person={p} areas={areas} canEdit={can(ctx, "people.write")} canMerge={can(ctx, "people.merge")} />}
            {can(ctx, "records.delete") && <DeleteButton kind="person" id={p.id} name={p.personCode} backTo="/patients" />}
          </>
        ) : undefined}
      />
      {p.watchFlag && (
        <div role="note" className="mb-4 flex items-start gap-2 rounded-sheet border border-pending bg-pending-bg px-4 py-3 text-ui">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-pending" />
          <span>On the watch list{!p.isRedacted && p.watchNote ? `: ${p.watchNote}` : "."}</span>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Aid received, lifetime" value={formatINR(d.lifetimePaise)} rule="approved" />
        <StatCard label={`Aid received, FY ${ctx.fy}`} value={formatINR(d.fyPaise)} rule="info" />
        <StatCard label="Cases" value={String(d.lifetimeCases)} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-12">
        <SheetPanel title="Identity" className="xl:col-span-4" rule={p.isRedacted ? "redacted" : "navy"}>
          {p.isRedacted ? (
            <div className="space-y-2 text-body">
              <p>{[p.gender && GENDER[p.gender], p.ageBand, MARITAL[p.maritalStatus]].filter(Boolean).join(" · ")}</p>
              <p className="flex items-center gap-1.5 text-label text-redacted"><EyeOff aria-hidden className="size-3.5" /> Identity hidden</p>
            </div>
          ) : (
            <dl className="space-y-3">
              <Field label="Father name">{p.fatherName}</Field>
              <Field label="Husband name">{p.husbandName}</Field>
              <Field label="Status">{MARITAL[p.maritalStatus]}</Field>
              <Field label="Age · gender">{[p.age != null ? `${p.age} years` : null, p.gender && GENDER[p.gender]].filter(Boolean).join(" · ")}</Field>
              <Field label="Address">{[p.addressLine, p.areaName, p.city, p.pincode].filter(Boolean).join(", ")}</Field>
              <Field label="Mobile no." mono>{[p.mobile, p.altMobile].filter(Boolean).join(" · ")}</Field>
              <Field label="Religion">{p.religion}</Field>
              <Field label="ID">{p.idType !== "NONE" ? `${ID_TYPE[p.idType]} ending ${p.idNumberLast4 ?? "—"}` : null}</Field>
              {p.notes && <Field label="Notes">{p.notes}</Field>}
            </dl>
          )}
        </SheetPanel>
        <div className="space-y-6 xl:col-span-8">
          <SheetPanel title="Cases as patient" bodyClassName="p-0"><CaseTable rows={d.asPatient} empty="Never the patient on a case." /></SheetPanel>
          <SheetPanel title="Cases as applicant" bodyClassName="p-0"><CaseTable rows={d.asApplicant} empty="Never the applicant on a case." /></SheetPanel>
        </div>
      </div>
    </>
  );
}
