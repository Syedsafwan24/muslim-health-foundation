import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, FileText } from "lucide-react";
import { getViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { canViewReport, cellText, fyPeriod, REPORTS, runReport, type ReportKey } from "@/lib/db/queries/reports";
import { readParams, type SearchParams } from "@/lib/params";
import { fmtDate } from "@/lib/fy";
import { listFiscalYears } from "@/lib/db/queries/fiscal-years";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader, SheetPanel } from "@/components/app/bits";
import { FilterBar } from "@/components/app/filter-bar";
import { HBars } from "@/components/app/charts";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getViewContext();
  const p = await readParams(searchParams);
  const allowed = (Object.keys(REPORTS) as ReportKey[]).filter((k) => canViewReport(ctx, k));
  if (!allowed.length) return <EmptyState icon={FileText}>Reports are not available to your role.</EmptyState>;
  const key = p.oneOf("r", allowed) ?? allowed[0];
  const fy = p.fy() ?? ctx.fy;
  const from = p.date("from");
  const to = p.dateEnd("to");
  const period = from && to ? { from, to, label: `${fmtDate(from)} to ${fmtDate(new Date(to.getTime() - 864e5))}` } : fyPeriod(fy);
  const result = await runReport(ctx, key, period);
  const canExport = can(ctx, "reports.export");
  const qs = new URLSearchParams({ fy, ...(p.str("from") ? { from: p.str("from")! } : {}), ...(p.str("to") ? { to: p.str("to")! } : {}) }).toString();

  return (
    <>
      <PageHeader title="Reports" meta={<>{REPORTS[key].label} · {period.label}</>} />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Reports" className="lg:sticky lg:top-20 lg:self-start">
          <ol className="space-y-1">
            {(Object.keys(REPORTS) as ReportKey[]).map((k, i) => {
              const ok = allowed.includes(k);
              return (
                <li key={k}>
                  {ok ? (
                    <Link href={`/reports?r=${k}&fy=${fy}`} aria-current={k === key ? "page" : undefined}
                      className={cn("flex gap-2 rounded-control px-3 py-2 text-ui", k === key ? "bg-navy-700 text-white" : "text-navy-900 hover:bg-navy-50")}>
                      <span className="tabular-nums opacity-70">{i + 1}.</span>{REPORTS[k].label}
                    </Link>
                  ) : (
                    <span className="flex gap-2 px-3 py-2 text-ui text-slate-body/60"><span className="tabular-nums">{i + 1}.</span>{REPORTS[k].label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 space-y-6">
          <p className="text-ui text-slate-body">{REPORTS[key].blurb}</p>
          <FilterBar filters={[
            { name: "fy", label: "Fiscal year", type: "select", options: (await listFiscalYears()).map((y) => ({ value: y.code, label: y.code })) },
            { name: "from", label: "Or from", type: "date" },
            { name: "to", label: "To", type: "date" },
          ]} />
          <div className="flex flex-wrap items-center gap-2" data-print-hide>
            {canExport ? (
              <>
                <Button variant="outline" asChild><a href={`/api/export/${key}?format=pdf&${qs}`}><FileText aria-hidden /> Export PDF</a></Button>
                <Button variant="outline" asChild><a href={`/api/export/${key}?format=xlsx&${qs}`}><FileSpreadsheet aria-hidden /> Export Excel</a></Button>
                {key === "beneficiaries" && can(ctx, "reports.exportUnredacted") && !ctx.meetingMode && (
                  <Button variant="outline" asChild><a href={`/api/export/${key}?format=xlsx&unredacted=1&${qs}`}>Export with names</a></Button>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" disabled><FileText aria-hidden /> Export PDF</Button>
                <Button variant="outline" disabled><FileSpreadsheet aria-hidden /> Export Excel</Button>
                <span className="text-caption text-slate-body">Your role can view reports but not export them.</span>
              </>
            )}
          </div>

          {result.tables.map((t, ti) => (
            <SheetPanel key={ti} title={t.title} bodyClassName="p-0">
              {t.chart && t.chart.length > 0 && (
                <div className="border-b border-rule p-5">
                  <HBars data={t.chart.map((c) => ({ name: c.name, amount: c.value }))} label={t.chartLabel ?? t.title} />
                </div>
              )}
              {t.rows.length === 0 ? (
                <p className="px-5 py-6 text-ui text-slate-body">Nothing to report for this period.</p>
              ) : (
                <div className="max-h-[36rem] overflow-auto">
                  <table className="w-full text-ui">
                    <caption className="sr-only">{t.title}</caption>
                    <thead className="sticky top-0 bg-navy-700 text-left text-white">
                      <tr>{t.columns.map((c) => <th key={c.key} scope="col" className={cn("px-3 py-2.5 text-label font-medium whitespace-nowrap", c.align === "right" && "text-right")}>{c.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {t.rows.map((r, i) => (
                        <tr key={i} className="h-[var(--row-h)] border-b border-rule">
                          {t.columns.map((c) => <td key={c.key} className={cn("px-3", c.align === "right" && "text-right tabular-nums", c.money && "font-mono")}>{cellText(r[c.key], c.money)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                    {t.totals && (
                      <tfoot className="sticky bottom-0 bg-navy-50 font-medium">
                        <tr>{t.columns.map((c) => <td key={c.key} className={cn("px-3 py-2.5", c.align === "right" && "text-right tabular-nums", c.money && "font-mono")}>{cellText(t.totals![c.key] ?? null, c.money)}</td>)}</tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
              {t.note && <p className="border-t border-rule px-5 py-3 text-caption text-slate-body">{t.note}</p>}
            </SheetPanel>
          ))}
        </div>
      </div>
    </>
  );
}
