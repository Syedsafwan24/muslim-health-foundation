import Link from "next/link";
import { fmtDate } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import { GENDER, PAYMENT_MODE } from "@/lib/labels";
import type { Breakdown, Slice } from "@/lib/db/queries/breakdown";
import { MoneyText, PaymentStatusBadge, PersonCell, SheetPanel, StatCard, StatusBadge } from "@/components/app/bits";
import { Donut, MonthBars } from "@/components/app/charts";
import { DataTable } from "@/components/app/data-table";
import { cn } from "@/lib/utils";

const TABS = [{ id: "cases", label: "Cases" }, { id: "patients", label: "Patients" }, { id: "payments", label: "Payments" }] as const;
export type BreakdownTab = (typeof TABS)[number]["id"];

/** Stat cards, charts, breakdowns and the Cases / Patients / Payments tables for one hospital or disease. */
export function BreakdownView({ d, basePath, tab, slices, donut, show }: {
  d: Breakdown;
  basePath: string;
  tab: BreakdownTab;
  /** Breakdown panels to show, in order. */
  slices: { title: string; data: Slice[] }[];
  /** Which breakdown feeds the donut next to the monthly chart. */
  donut: { title: string; data: Slice[] };
  /** Columns that would repeat the page's own subject are hidden (the hospital on a hospital page). */
  show: { disease: boolean; hospital: boolean };
}) {
  const s = d.stats;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard label={`Total paid · this FY ${formatINR(s.fyPaise)}`} value={formatINR(s.totalPaise)} rule="approved" />
        <StatCard label="Cases" value={s.cases.toLocaleString("en-IN")} />
        <StatCard label="Patients" value={s.patients.toLocaleString("en-IN")} />
        <StatCard label="Approved" value={formatINR(s.approvedPaise)} rule="info" />
        <StatCard label={`Average per case · largest ${formatINR(s.largestPaise)}`} value={formatINR(s.averagePaise)} rule="info" />
        <StatCard label="Cheques not yet cleared" value={String(s.pendingCheques)} rule="pending" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <SheetPanel title="Amount paid, last 12 months"><MonthBars data={d.monthly} dataKey="amount" name="Amount paid" /></SheetPanel>
        <SheetPanel title={donut.title}>
          {donut.data.length ? <Donut data={donut.data.map((x) => ({ name: x.name, value: x.cases }))} label={`Donut chart of cases by ${donut.title.toLowerCase()}`} /> : <p className="text-ui text-slate-body">No cases yet.</p>}
        </SheetPanel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {slices.filter((x) => x.data.length).map((x) => <SliceTable key={x.title} title={x.title} data={x.data} />)}
      </div>

      <nav aria-label="Tables" className="mt-8 flex gap-1 border-b border-rule">
        {TABS.map((t) => {
          const n = t.id === "cases" ? d.cases.length : t.id === "patients" ? d.patients.length : d.payments.length;
          return (
            <Link key={t.id} href={`${basePath}?tab=${t.id}`} scroll={false} aria-current={tab === t.id ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-4 py-2.5 text-ui", tab === t.id ? "border-navy-700 font-medium text-navy-900" : "border-transparent text-slate-body hover:text-navy-900")}>
              {t.label} <span className="ml-1 text-caption tabular-nums text-slate-body">{n}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-4">
        {tab === "cases" && (
          <DataTable
            caption="Cases"
            total={d.cases.length}
            pageSize={Math.max(d.cases.length, 1)}
            columns={[
              { id: "caseNo", header: "Case no", sortable: true, hideable: false },
              { id: "date", header: "Date", sortable: true, hideable: false },
              { id: "patient", header: "Patient", sortable: true, hideable: false },
              { id: "gender", header: "Gender", sortable: true, hideable: false },
              { id: "age", header: "Age", align: "right", sortable: true, hideable: false },
              ...(show.disease ? [{ id: "disease", header: "Major problem", sortable: true, hideable: false }] : []),
              ...(show.hospital ? [{ id: "hospital", header: "Hospital", sortable: true, hideable: false }] : []),
              { id: "approved", header: "Approved", align: "right" as const, sortable: true, hideable: false },
              { id: "paid", header: "Paid", align: "right" as const, sortable: true, hideable: false },
              { id: "status", header: "Status", sortable: true, hideable: false },
            ]}
            rows={d.cases.map((c) => ({
              id: c.id,
              href: `/applications/${c.id}`,
              sort: {
                caseNo: c.caseNo, date: c.applicationDate.getTime(), patient: c.patient.displayName, gender: c.gender, age: c.age,
                disease: c.diseaseName, hospital: c.hospitalName, approved: Number(c.approvedPaise ?? 0n), paid: Number(c.paidPaise), status: c.status,
              },
              cells: {
                caseNo: <span className="whitespace-nowrap font-mono text-mono-sm">{c.caseNo}</span>,
                date: <time>{fmtDate(c.applicationDate)}</time>,
                patient: <PersonCell person={c.patient} />,
                gender: c.gender ? GENDER[c.gender] : "—",
                age: c.age ?? "—",
                disease: c.diseaseName ?? "—",
                hospital: c.hospitalName ?? "—",
                approved: <MoneyText paise={c.approvedPaise} className="font-mono" />,
                paid: <MoneyText paise={c.paidPaise || null} className="font-mono" />,
                status: <StatusBadge status={c.status} />,
              },
            }))}
            empty={<p className="px-5 py-6 text-ui text-slate-body">No cases yet.</p>}
          />
        )}
        {tab === "patients" && (
          <DataTable
            caption="Patients"
            total={d.patients.length}
            pageSize={Math.max(d.patients.length, 1)}
            columns={[
              { id: "patient", header: "Patient", sortable: true, hideable: false },
              { id: "gender", header: "Gender", sortable: true, hideable: false },
              { id: "age", header: "Age", align: "right", sortable: true, hideable: false },
              { id: "city", header: "City", sortable: true, hideable: false },
              { id: "cases", header: "Cases", align: "right", sortable: true, hideable: false },
              { id: "paid", header: "Paid", align: "right", sortable: true, hideable: false },
              { id: "last", header: "Last case", sortable: true, hideable: false },
            ]}
            rows={d.patients.map((p) => ({
              id: p.person.id,
              href: `/people/${p.person.id}`,
              sort: { patient: p.person.displayName, gender: p.gender, age: p.age, city: p.city ?? null, cases: p.cases, paid: Number(p.paidPaise), last: p.lastCase.getTime() },
              cells: {
                patient: <PersonCell person={p.person} />,
                gender: p.gender ? GENDER[p.gender] : "—",
                age: p.age ?? "—",
                city: p.city ?? "—",
                cases: p.cases,
                paid: <MoneyText paise={p.paidPaise || null} className="font-mono" />,
                last: <time>{fmtDate(p.lastCase)}</time>,
              },
            }))}
            empty={<p className="px-5 py-6 text-ui text-slate-body">No patients yet.</p>}
          />
        )}
        {tab === "payments" && (
          <DataTable
            caption="Payments"
            total={d.payments.length}
            pageSize={Math.max(d.payments.length, 1)}
            columns={[
              { id: "voucher", header: "Voucher", sortable: true, hideable: false },
              { id: "date", header: "Date", sortable: true, hideable: false },
              { id: "case", header: "Case", sortable: true, hideable: false },
              { id: "mode", header: "Mode", sortable: true, hideable: false },
              { id: "ref", header: "Cheque / ref", sortable: true, hideable: false },
              { id: "bank", header: "Bank", sortable: true, hideable: false },
              { id: "fund", header: "Fund", sortable: true, hideable: false },
              { id: "amount", header: "Amount", align: "right", sortable: true, hideable: false },
              { id: "status", header: "Status", sortable: true, hideable: false },
            ]}
            rows={d.payments.map((p) => ({
              id: p.id,
              href: `/payments/${p.id}`,
              sort: { voucher: p.voucherNo, date: p.paymentDate.getTime(), case: p.caseNo, mode: p.mode, ref: p.chequeNo, bank: p.bankName, fund: p.fundName, amount: Number(p.amountPaise), status: p.status },
              cells: {
                voucher: <span className="whitespace-nowrap font-mono text-mono-sm">{p.voucherNo}</span>,
                date: <time>{fmtDate(p.paymentDate)}</time>,
                case: <span className="whitespace-nowrap font-mono text-mono-sm">{p.caseNo}</span>,
                mode: PAYMENT_MODE[p.mode],
                ref: <span className="font-mono text-mono-sm">{p.chequeNo ?? "—"}</span>,
                bank: p.bankName ?? "—",
                fund: p.fundName,
                amount: <MoneyText paise={p.amountPaise} className="font-mono" />,
                status: <PaymentStatusBadge status={p.status} />,
              },
            }))}
            empty={<p className="px-5 py-6 text-ui text-slate-body">No payments yet.</p>}
          />
        )}
      </div>
    </>
  );
}

/** A breakdown as a small table with a proportion bar on the amount. */
function SliceTable({ title, data }: { title: string; data: Slice[] }) {
  const max = data.reduce((m, x) => (x.paidPaise > m ? x.paidPaise : m), 0n);
  const th = "px-3 py-2 text-label font-medium";
  return (
    <SheetPanel title={title} bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-ui">
          <caption className="sr-only">{title}</caption>
          <thead className="sticky top-0 border-b border-rule bg-sheet text-left text-slate-body">
            <tr><th scope="col" className={th}>{title.replace(/^By (.)/, (_, c: string) => c.toUpperCase())}</th><th scope="col" className={`${th} text-right`}>Cases</th><th scope="col" className={`${th} text-right`}>Patients</th><th scope="col" className={`${th} w-[40%] text-right`}>Paid</th></tr>
          </thead>
          <tbody>
            {data.map((x) => (
              <tr key={x.key} className="h-[var(--row-h)] border-b border-rule last:border-b-0">
                <td className="px-3">{x.href ? <Link href={x.href} className="hover:underline">{x.name}</Link> : x.name}</td>
                <td className="px-3 text-right tabular-nums">{x.cases}</td>
                <td className="px-3 text-right tabular-nums">{x.patients}</td>
                <td className="px-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-navy-50 sm:block" aria-hidden>
                      <div className="h-full rounded-full bg-navy-700" style={{ width: max > 0n ? `${Number((x.paidPaise * 100n) / max)}%` : "0%" }} />
                    </div>
                    <MoneyText paise={x.paidPaise} className="font-mono" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SheetPanel>
  );
}
