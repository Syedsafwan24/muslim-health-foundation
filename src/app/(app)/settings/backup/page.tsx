import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { lastBackup } from "@/lib/db/queries/admin";
import { fmtDateTime } from "@/lib/fy";
import { SheetPanel } from "@/components/app/bits";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Backup and data" };

export default async function BackupSettings() {
  const ctx = await requirePage("settings.read");
  const last = await lastBackup();
  const stale = !last || Date.now() - last.getTime() > 36 * 3600 * 1000;
  return (
    <div className="space-y-6">
      <SheetPanel title="Backups" rule={stale ? "rejected" : "approved"}>
        <p className="text-body">Last backup: <span className={stale ? "text-rejected" : "text-approved"}>{last ? fmtDateTime(last) : "none recorded"}</span></p>
        <p className="mt-2 max-w-[68ch] text-ui text-slate-body">
          A nightly job dumps the database, encrypts it with the trust&apos;s backup key and stores it off the server; the document store keeps every version of every file.
          The job and the restore steps are in <span className="font-mono">docs/RUNBOOK.md</span>. A restore must be tested before go-live.
          {stale && " No backup has been recorded in the last 36 hours — check the backup job."}
        </p>
      </SheetPanel>
      {can(ctx, "audit.export") && (
        <SheetPanel title="Export the audit log">
          <p className="mb-3 text-ui text-slate-body">A complete Excel copy of every recorded action. The export itself is recorded.</p>
          <Button variant="outline" asChild><a href="/api/export/audit?format=xlsx" download>Export audit log</a></Button>
        </SheetPanel>
      )}
    </div>
  );
}
