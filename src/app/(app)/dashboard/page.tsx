import type { Metadata } from "next";
import Link from "next/link";
import { Activity } from "lucide-react";
import { getViewContext } from "@/lib/auth/context";
import { getDashboard } from "@/lib/db/queries/analytics";
import { formatINR } from "@/lib/money";
import { fmtDateTime } from "@/lib/fy";
import { AUDIT_ACTION } from "@/lib/labels";
import { Delta, EmptyState, FundBar, PageHeader, SheetPanel, StatCard } from "@/components/app/bits";
import { Donut, FlowChart, HBars } from "@/components/app/charts";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await getViewContext();
  const d = await getDashboard(ctx);
  const s = d.stats;
  const attention = [
    { label: "approved cases waiting for payment", count: d.attention.toPay, href: "/applications?status=APPROVED,PARTIALLY_APPROVED,PAYMENT_PENDING" },
    { label: "cheques not cleared after 30 days", count: d.attention.unclearedCheques, href: "/payments?uncleared30=1" },
    { label: "cases missing documents", count: d.attention.missingDocs, href: "/applications?pendingDocs=1" },
    { label: "unfinished entries (drafts)", count: d.attention.drafts, href: "/applications?status=DRAFT" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" meta={<>Fiscal year {ctx.fy}</>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Cases received" value={s.cases.cur.toLocaleString("en-IN")} delta={<Delta cur={s.cases.cur} prev={s.cases.prev} />} href="/applications" />
        <StatCard label="Amount paid" value={formatINR(s.disbursed.cur)} delta={<Delta cur={s.disbursed.cur} prev={s.disbursed.prev} money />} rule="approved" />
        <StatCard label="Donations received" value={formatINR(s.donations.cur)} delta={<Delta cur={s.donations.cur} prev={s.donations.prev} money />} rule="zakat" />
        <StatCard label="People helped" value={s.helped.cur.toLocaleString("en-IN")} delta={<span>{s.helped.repeat} helped in an earlier year too</span>} rule="info" />
      </div>

      <SheetPanel title="Fund balances" className="mt-6" rule="zakat">
        <div className="space-y-4">
          {d.funds.map((f) => <FundBar key={f.id} name={f.name} type={f.type} balancePaise={f.balancePaise} committedPct={f.committedPct} low={f.low} />)}
        </div>
      </SheetPanel>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <SheetPanel title="Donations received and amount paid, by month">
          <FlowChart data={d.flow} />
        </SheetPanel>
        <SheetPanel title="Disease mix">
          {d.diseaseMix.length ? <Donut data={d.diseaseMix} label="Donut chart of cases by disease category" /> : <p className="text-ui text-slate-body">No cases this year yet.</p>}
        </SheetPanel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <SheetPanel title="Top hospitals by amount paid">
          {d.topHospitals.length ? <HBars data={d.topHospitals} label="Bar chart of the top hospitals by amount paid" /> : <p className="text-ui text-slate-body">No payments this year yet.</p>}
        </SheetPanel>
        <SheetPanel title="Needs attention" rule="pending">
          <ul className="divide-y divide-rule">
            {attention.map((a) => (
              <li key={a.label}>
                <Link href={a.href} className="flex items-baseline gap-3 py-2.5 hover:underline">
                  <span className="w-10 text-right text-h3 tabular-nums text-navy-900">{a.count}</span>
                  <span className="text-ui text-slate-body">{a.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SheetPanel>
      </div>

      <SheetPanel title="Recent activity" className="mt-6" bodyClassName="p-0">
        {d.recent.length === 0 ? (
          <EmptyState icon={Activity}>No activity recorded yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {d.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5 text-ui">
                <time className="w-40 shrink-0 text-caption text-slate-body">{fmtDateTime(r.at)}</time>
                <span className="text-navy-900">{r.summary ?? AUDIT_ACTION[r.action]}</span>
                <span className="text-caption text-slate-body">by {r.actor}</span>
              </li>
            ))}
          </ul>
        )}
      </SheetPanel>
    </>
  );
}
