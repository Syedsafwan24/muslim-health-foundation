import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Circle, EyeOff, Printer } from "lucide-react";
import { getViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getApplication, getApplicationHistory } from "@/lib/db/queries/applications";
import { activeFunds } from "@/lib/db/queries/funds";
import { masterOptions } from "@/lib/db/queries/admin";
import { getSetting } from "@/lib/settings";
import { fmtDate, fmtDateTime } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import {
  AUDIT_ACTION, CASE_DOCUMENTS, GENDER, MARITAL, PAYMENT_MODE, RELATION, TOWARDS,
} from "@/lib/labels";
import { EDITABLE, PAYABLE, STATUS_LABEL } from "@/lib/applications/transitions";
import type { PersonView } from "@/lib/redact";
import { AliasChip, Field, MoneyText, PageHeader, PaymentStatusBadge, Pill, SheetPanel, StatusBadge } from "@/components/app/bits";
import { DeleteButton } from "@/components/app/delete-button";
import { Button } from "@/components/ui/button";
import { readParams, type SearchParams } from "@/lib/params";
import {
  PaymentForm, PaymentRowActions, RevealBanner, RevealButton, DraftActions, DocumentSlots,
} from "./case-client";

export const metadata: Metadata = { title: "Case" };

const TABS = [
  { id: "application", label: "Application" },
  { id: "documents", label: "Documents" },
  { id: "payments", label: "Payments" },
  { id: "history", label: "History" },
] as const;

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const ctx = await getViewContext();
  const { id } = await params;
  const sp = await readParams(searchParams);
  const tabs = TABS.filter((t) => t.id !== "payments" || can(ctx, "payments.read"));
  const tab = sp.oneOf("tab", tabs.map((t) => t.id)) ?? "application";
  const a = await getApplication(ctx, id);
  if (!a) notFound();

  const canWrite = can(ctx, "applications.write") && EDITABLE(a.status) && !a.masked;
  const canPay = can(ctx, "payments.write") && PAYABLE.includes(a.status);

  return (
    <>
      <PageHeader
        back={{ href: "/applications", label: "Applications" }}
        title={<span className="font-mono">{a.caseNo}</span>}
        meta={
          <>
            <StatusBadge status={a.status} />
            <span>Date {fmtDate(a.applicationDate)} · entered by {a.createdByName}</span>
          </>
        }
        actions={
          <>
            {a.canReveal && <RevealButton applicationId={a.id} caseNo={a.caseNo} />}
            {canWrite && (
              <Button variant="outline" asChild>
                <Link href={`/applications/${a.id}/edit`}>Edit application</Link>
              </Button>
            )}
            {a.status !== "DRAFT" && can(ctx, "reports.export") && (
              <Button variant="outline" asChild>
                <a href={`/api/export/case-sheet?id=${a.id}`} target="_blank" rel="noopener"><Printer aria-hidden /> Case sheet</a>
              </Button>
            )}
            {a.status !== "DRAFT" && !a.masked && can(ctx, "records.delete") && <DeleteButton kind="case" id={a.id} name={`case ${a.caseNo}`} backTo="/applications" />}
          </>
        }
      />

      {a.grantExpiresAt && <RevealBanner applicationId={a.id} expiresAt={a.grantExpiresAt.toISOString()} />}
      {a.watch.map((w) => (
        <div key={w.personCode} role="note" className="mb-4 flex items-start gap-2 rounded-sheet border border-pending bg-pending-bg px-4 py-3 text-ui text-navy-900">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-pending" />
          <span><span className="font-mono">{w.personCode}</span> is on the watch list{w.note ? `: ${w.note}` : "."}</span>
        </div>
      ))}
      {a.bounced && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-sheet border border-rejected bg-rejected-bg px-4 py-3 text-ui text-rejected">
          <AlertTriangle aria-hidden className="size-4" /> A payment on this case bounced.{can(ctx, "payments.read") && " See the Payments tab."}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Approved (INR)" value={formatINR(a.approvedAmountPaise)} rule="info" />
        <Stat label="Paid" value={formatINR(a.paidPaise)} rule="approved" />
        <Stat label="Approx hospital expenses" value={formatINR(a.approxExpensePaise)} />
        <Stat label="Name of the hospital" value={a.hospital?.name ?? "—"} small sub={a.hospital?.city} />
      </div>

      <nav aria-label="Case sections" className="mt-6 flex gap-1 overflow-x-auto border-b border-rule" data-print-hide>
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/applications/${a.id}${t.id === "application" ? "" : `?tab=${t.id}`}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px rounded-t-control border-b-2 px-4 py-2.5 text-ui font-medium whitespace-nowrap ${tab === t.id ? "border-navy-700 text-navy-900" : "border-transparent text-slate-body hover:text-navy-900"}`}
          >
            {t.label}
            {t.id === "documents" && <span className="ml-1.5 text-caption tabular-nums text-slate-body">{a.attachments.length}</span>}
            {t.id === "payments" && !!a.payments.length && <span className="ml-1.5 text-caption tabular-nums text-slate-body">{a.payments.length}</span>}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "application" && <ApplicationTab a={a} />}
        {tab === "documents" && <DocumentsTab a={a} canUpload={can(ctx, "attachments.write") && !a.masked && a.status !== "CLOSED"} canVerify={can(ctx, "attachments.write") && !a.masked} />}
        {tab === "payments" && <PaymentsTab a={a} canPay={canPay} canManage={can(ctx, "payments.write")} />}
        {tab === "history" && <HistoryTab id={a.id} masked={a.masked} />}
      </div>
    </>
  );
}

type A = NonNullable<Awaited<ReturnType<typeof getApplication>>>;

function Stat({ label, value, rule = "navy", small, sub }: { label: string; value: string; rule?: "navy" | "info" | "approved"; small?: boolean; sub?: string | null }) {
  return (
    <SheetPanel rule={rule} bodyClassName="px-5 py-4">
      <div className={small ? "text-h2 text-navy-900" : "text-h1 tabular-nums whitespace-nowrap text-navy-900 2xl:text-display"}>{value}</div>
      <div className="mt-1 text-label text-slate-body">{sub ? `${label} · ${sub}` : label}</div>
    </SheetPanel>
  );
}

function PersonBlock({ title, p, extra }: { title: string; p: PersonView; extra?: React.ReactNode }) {
  if (p.isRedacted) {
    return (
      <SheetPanel title={title} rule="redacted">
        <div className="space-y-2">
          <AliasChip code={p.personCode} className="text-ui" />
          <p className="text-body text-navy-900">{[p.gender && GENDER[p.gender], p.ageBand, MARITAL[p.maritalStatus]].filter(Boolean).join(" · ")}</p>
          <p className="flex items-center gap-1.5 text-label text-redacted"><EyeOff aria-hidden className="size-3.5" /> Identity hidden for this meeting</p>
          {extra}
        </div>
      </SheetPanel>
    );
  }
  return (
    <SheetPanel title={title} action={<Link href={`/people/${p.id}`} className="font-mono text-mono-sm text-info hover:underline">{p.personCode}</Link>}>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">{p.fullName}</Field>
        <Field label="Father name">{p.fatherName}</Field>
        <Field label="Husband name">{p.husbandName}</Field>
        <Field label="Address" className="sm:col-span-2">{p.addressLine}</Field>
        <Field label="Status">{MARITAL[p.maritalStatus]}</Field>
        <Field label="Age · gender">{[p.age != null ? `${p.age} years` : null, p.gender && GENDER[p.gender]].filter(Boolean).join(" · ")}</Field>
        <Field label="Religion">{p.religion}</Field>
        <Field label="Mobile no." mono>{p.mobile}</Field>
        {extra}
      </dl>
    </SheetPanel>
  );
}

function ApplicationTab({ a }: { a: A }) {
  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <PersonBlock title={a.patientIsApplicant ? "Applicant (also the patient)" : "Applicant"} p={a.applicant} />
        {!a.patientIsApplicant && <PersonBlock title="Patient" p={a.patient} extra={<Field label="Dependent">{a.dependentCount}</Field>} />}
        <SheetPanel title="Case">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {!a.patientIsApplicant && <Field label="Applicant relation with patient">{RELATION[a.relation]}</Field>}
            {a.patientIsApplicant && <Field label="Dependent">{a.dependentCount}</Field>}
            {!a.masked && <Field label="Introduced by">{a.introducedByName}</Field>}
            {!a.masked && <Field label="Attending Dr.">{a.attendingDoctor}</Field>}
            <Field label="Major problem of the patient" className="sm:col-span-2">{a.disease ? `${a.disease.name} (${a.disease.categoryName})` : <span className="whitespace-pre-line">{a.majorProblem}</span>}</Field>
            <Field label="Approx hospital expenses"><MoneyText paise={a.approxExpensePaise} /></Field>
            <Field label="Name of the hospital">{a.hospital ? `${a.hospital.name}${a.hospital.city ? `, ${a.hospital.city}` : ""}` : null}</Field>
          </dl>
        </SheetPanel>
      </div>

      <aside className="space-y-6 xl:col-span-4">
        {a.status === "DRAFT" && (
          <SheetPanel title="Draft">
            <DraftActions id={a.id} />
          </SheetPanel>
        )}
        <SheetPanel title="Prior aid" rule={a.repeatCount > 1 ? "pending" : "navy"}>
          <div className="space-y-4 text-ui">
            <PriorLine label="Applicant" prior={a.applicantPrior} />
            {a.patientPrior && <PriorLine label="Patient" prior={a.patientPrior} />}
            {a.repeatCount > 1 && (
              <p className="flex items-center gap-2 font-medium text-pending">
                <AlertTriangle aria-hidden className="size-4" /> {ordinal(a.repeatCount)} application in 12 months
              </p>
            )}
          </div>
        </SheetPanel>
        <SheetPanel title="Documents" rule={a.missingDocuments.length ? "pending" : "approved"}>
          <ChecklistView present={a.presentTypes} />
          <Link href={`/applications/${a.id}?tab=documents`} className="mt-3 inline-block text-label text-info hover:underline">Open documents</Link>
        </SheetPanel>
        {a.earmarks.length > 0 && (
          <SheetPanel title="Funded by donor" rule="zakat">
            <ul className="space-y-2 text-ui">
              {a.earmarks.map((d) => (
                <li key={d.receiptNo} className="flex justify-between gap-2"><span>{d.donorName} <span className="font-mono text-caption text-slate-body">{d.receiptNo}</span></span><MoneyText paise={d.amountPaise} /></li>
              ))}
            </ul>
          </SheetPanel>
        )}
      </aside>
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

function PriorLine({ label, prior }: { label: string; prior: A["applicantPrior"] }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-label text-slate-body">{label}</span>
        <span className="font-mono text-mono-sm">{prior.personCode}</span>
        {prior.watchFlag && <Pill tone="pending">Watch</Pill>}
      </div>
      <p className="mt-0.5 text-navy-900">
        {prior.cases === 0 ? "No previous cases" : `${prior.cases} previous ${prior.cases === 1 ? "case" : "cases"} · ${formatINR(prior.totalPaise)}${prior.lastAidAt ? ` · last ${fmtDate(prior.lastAidAt)}` : ""}`}
      </p>
    </div>
  );
}

function ChecklistView({ present }: { present: string[] }) {
  return (
    <ul className="grid grid-cols-1 gap-1.5 text-ui sm:grid-cols-2 xl:grid-cols-1">
      {CASE_DOCUMENTS.map((d) => {
        const ok = present.includes(d.type) || (d.type === "HOSPITAL_BILL" && present.includes("RECEIPT"));
        return (
          <li key={d.type} className="flex items-center gap-2">
            {ok ? <CheckCircle2 aria-hidden className="size-4 text-approved" /> : <Circle aria-hidden className="size-4 text-pending" />}
            <span className={ok ? "" : "text-pending"}>{d.label}</span>
            <span className="sr-only">{ok ? "present" : "missing"}</span>
          </li>
        );
      })}
    </ul>
  );
}

async function DocumentsTab({ a, canUpload, canVerify }: { a: A; canUpload: boolean; canVerify: boolean }) {
  const maxMb = await getSetting("documents.maxFileMb");
  return (
    <SheetPanel title="Documents" rule={a.missingDocuments.length ? "pending" : "approved"}>
      <DocumentSlots applicationId={a.id} files={a.attachments} maxMb={maxMb} canUpload={canUpload} canVerify={canVerify} canDelete={canUpload && !["PAID", "CLOSED"].includes(a.status)} />
      {a.masked && <p className="mt-3 text-label text-redacted">Documents are locked while identities are hidden.</p>}
    </SheetPanel>
  );
}

async function PaymentsTab({ a, canPay, canManage }: { a: A; canPay: boolean; canManage: boolean }) {
  const [funds, m] = canPay ? await Promise.all([activeFunds("aid"), masterOptions()]) : [[], null];
  const remaining = (a.approvedAmountPaise ?? 0n) - a.paidPaise;
  return (
    <div className="space-y-6">
      <SheetPanel title="Payments against this case" bodyClassName="p-0" action={<span className="text-ui text-slate-body">Paid <MoneyText paise={a.paidPaise} /> of <MoneyText paise={a.approvedAmountPaise} /></span>}>
        {a.payments.length === 0 ? (
          <p className="px-5 py-6 text-body text-slate-body">{canPay ? "No payments yet. Record the first payment below." : "No payments yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-ui">
              <caption className="sr-only">Payments</caption>
              <thead className="bg-navy-700 text-left text-white">
                <tr>
                  {["Voucher", "Date", "Mode", "Cheque / ref", "Payee", "Towards", "Amount", "Status", ""].map((h) => <th key={h} scope="col" className={`px-3 py-2.5 text-label font-medium ${h === "Amount" ? "text-right" : ""}`}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {a.payments.map((p) => (
                  <tr key={p.id} className="h-[var(--row-h)] border-b border-rule last:border-b-0">
                    <td className="px-3 font-mono text-mono-sm"><Link href={`/payments/${p.id}`} className="hover:underline">{p.voucherNo}</Link></td>
                    <td className="px-3"><time>{fmtDate(p.paymentDate)}</time></td>
                    <td className="px-3">{PAYMENT_MODE[p.mode]}</td>
                    <td className="px-3 font-mono text-mono-sm">{p.chequeNo ?? p.referenceNo ?? "—"}</td>
                    <td className="px-3">{p.hospitalName ?? p.payeeName ?? (p.payeeName === undefined ? <span className="text-redacted">Hidden</span> : "—")}</td>
                    <td className="px-3">{TOWARDS[p.towards]}</td>
                    <td className="px-3 text-right font-mono"><MoneyText paise={p.amountPaise} /></td>
                    <td className="px-3">
                      <PaymentStatusBadge status={p.status} />
                      {p.isReversal && <Pill tone="slate" className="ml-1">Reversal</Pill>}
                      {p.reversed && <Pill tone="rejected" className="ml-1">Reversed</Pill>}
                    </td>
                    <td className="px-3 text-right">
                      <PaymentRowActions id={p.id} voucherNo={p.voucherNo} status={p.status} canManage={canManage && !p.isReversal && !p.reversed} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SheetPanel>
      {canPay && m && (
        <SheetPanel title="Record payment" rule="approved">
          <PaymentForm
            applicationId={a.id}
            remainingPaise={remaining > 0n ? remaining : 0n}
            funds={funds.map((f) => ({ id: f.id, name: f.name }))}
            banks={m.banks.filter((b) => b.isOwnAccount).concat(m.banks.filter((b) => !b.isOwnAccount))}
            hospitals={m.hospitals}
            defaultHospitalId={a.hospital?.id ?? null}
          />
        </SheetPanel>
      )}
      {!canPay && a.status !== "PAID" && a.status !== "CLOSED" && canManage && (
        <p className="text-ui text-slate-body">Payments can be recorded once the case is approved.</p>
      )}
    </div>
  );
}

async function HistoryTab({ id, masked }: { id: string; masked: boolean }) {
  const ctx = await getViewContext();
  const items = await getApplicationHistory(ctx, id, masked);
  return (
    <SheetPanel title="History" bodyClassName="p-0">
      <ol className="relative">
        {items.map((h, i) => (
          <li key={i} className={`flex gap-4 border-b border-rule px-5 py-3 last:border-b-0 ${h.highlight ? "bg-redacted-bg" : ""}`}>
            <time className="w-40 shrink-0 text-caption text-slate-body">{fmtDateTime(h.at)}</time>
            <div className="min-w-0 text-ui">
              {h.kind === "status" ? (
                <p>
                  {STATUS_LABEL[h.action as keyof typeof STATUS_LABEL] ? <StatusBadge status={h.action as keyof typeof STATUS_LABEL} /> : null}
                  {h.actor && <span className="ml-2 text-slate-body">by {h.actor}</span>}
                </p>
              ) : (
                <p className={h.highlight ? "font-medium text-redacted" : ""}>
                  {h.action === "REVEAL_IDENTITY" ? `Identity revealed by ${h.actor ?? "—"}` : h.text || AUDIT_ACTION[h.action as keyof typeof AUDIT_ACTION]}
                  {h.action !== "REVEAL_IDENTITY" && h.actor && <span className="ml-2 text-slate-body">by {h.actor}</span>}
                </p>
              )}
              {h.reason && <p className="mt-0.5 text-slate-body">{h.reason}</p>}
            </div>
          </li>
        ))}
      </ol>
    </SheetPanel>
  );
}
