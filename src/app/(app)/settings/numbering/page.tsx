import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/context";
import { numberingPreview } from "@/lib/db/queries/admin";
import { SheetPanel } from "@/components/app/bits";

export const metadata: Metadata = { title: "Numbering" };

export default async function NumberingSettings() {
  const ctx = await requirePage("settings.read");
  const rows = await numberingPreview(ctx.fy);
  const th = "px-3 py-2.5 text-label font-medium";
  return (
    <SheetPanel title="Numbering" bodyClassName="p-0">
      <p className="px-5 py-3 text-ui text-slate-body">
        Numbers are issued in order inside a locked database row, so two clerks can never receive the same number and none is ever reused.
        Case, voucher, receipt and expense numbers restart each fiscal year. The case number format is a proposal awaiting the trust&apos;s confirmation (open question 6).
      </p>
      <table className="w-full text-ui">
        <thead className="bg-navy-700 text-left text-white"><tr><th className={th}>Series</th><th className={th}>Format</th><th className={th}>Next number</th><th className={th}>Restarts</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.series} className="h-[var(--row-h)] border-b border-rule last:border-b-0">
              <td className="px-3">{r.series}</td>
              <td className="px-3 font-mono text-mono-sm">{r.format}</td>
              <td className="px-3 font-mono text-mono-sm">{r.next}</td>
              <td className="px-3">{r.perFy ? "Every 1 April" : "Never"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SheetPanel>
  );
}
