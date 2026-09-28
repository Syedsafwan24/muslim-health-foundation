import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { fiscalYearOverview } from "@/lib/db/queries/fiscal-years";
import { fmtDate } from "@/lib/fy";
import { Pill, SheetPanel } from "@/components/app/bits";
import { CloseYear, ReopenYear, StartYear } from "./fiscal-year-forms";

export const metadata: Metadata = { title: "Fiscal years" };

export default async function FiscalYearsSettings() {
  const ctx = await requirePage("settings.read");
  const canWrite = can(ctx, "settings.write");
  const years = await fiscalYearOverview();
  const next = years[0] ? `${Number(years[0].code.slice(0, 4)) + 1}-${String((Number(years[0].code.slice(0, 4)) + 2) % 100).padStart(2, "0")}` : null;
  const th = "px-3 py-2.5 text-label font-medium";
  // The last day shown is 31 March: endsOn is the next 1 April (exclusive).
  const lastDay = (d: Date) => fmtDate(new Date(d.getTime() - 864e5));
  return (
    <SheetPanel title="Fiscal years" bodyClassName="p-0" action={canWrite && next ? <StartYear next={next} /> : undefined}>
      <p className="px-5 py-3 text-ui text-slate-body">
        A fiscal year runs from 1 April to 31 March. Cases, payments, donations and expenses can only be recorded in a year that has been started
        and is not closed. Case, voucher, receipt and expense numbers restart with each year.
      </p>
      <table className="w-full text-ui">
        <caption className="sr-only">Fiscal years</caption>
        <thead className="bg-navy-700 text-left text-white">
          <tr>
            <th className={th}>Year</th><th className={th}>Dates</th><th className={th}>Status</th>
            <th className={`${th} text-right`}>Cases</th><th className={`${th} text-right`}>Payments</th><th className={`${th} text-right`}>Donations</th>
            <th className={th}>Still open</th>{canWrite && <th className={th}><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y.code} className="border-b border-rule last:border-b-0">
              <td className="px-3 py-3 font-medium whitespace-nowrap">FY {y.code}</td>
              <td className="px-3 py-3 whitespace-nowrap">{fmtDate(y.startsOn)} – {lastDay(y.endsOn)}</td>
              <td className="px-3 py-3">
                {y.status === "OPEN" ? <Pill tone="approved">Open</Pill> : <Pill tone="slate">Closed</Pill>}
                <div className="mt-1 text-caption text-slate-body">
                  {y.status === "CLOSED" ? `Closed ${fmtDate(y.closedAt)}${y.closedBy ? ` by ${y.closedBy}` : ""}` : `Started ${fmtDate(y.openedAt)}${y.openedBy ? ` by ${y.openedBy}` : ""}`}
                </div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{y.cases}</td>
              <td className="px-3 py-3 text-right tabular-nums">{y.payments}</td>
              <td className="px-3 py-3 text-right tabular-nums">{y.donations}</td>
              <td className="px-3 py-3 text-caption text-slate-body">
                {y.drafts || y.unissued
                  ? [y.drafts && `${y.drafts} unfinished ${y.drafts === 1 ? "entry" : "entries"}`, y.unissued && `${y.unissued} receipt${y.unissued === 1 ? "" : "s"} not issued`].filter(Boolean).join(" · ")
                  : "—"}
              </td>
              {canWrite && (
                <td className="px-3 py-3 text-right">
                  {y.status === "OPEN" ? <CloseYear code={y.code} drafts={y.drafts} unissued={y.unissued} running={y.endsOn > new Date()} /> : <ReopenYear code={y.code} />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </SheetPanel>
  );
}
