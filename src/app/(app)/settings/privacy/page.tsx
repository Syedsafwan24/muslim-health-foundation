import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { privacySettings } from "@/lib/db/queries/admin";
import { fmtDateTime } from "@/lib/fy";
import { SheetPanel } from "@/components/app/bits";
import { GlobalSwitch } from "../settings-forms";

export const metadata: Metadata = { title: "Hide names" };

export default async function HideNamesSettings() {
  const ctx = await requirePage("settings.read");
  const p = await privacySettings(ctx);
  return (
    <SheetPanel title="Hide names" rule="redacted">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-body font-medium text-navy-900">Hide the names of patients and applicants for everyone</p>
          <p className="mt-1 max-w-[68ch] text-ui text-slate-body">
            Use this in committee meetings. Everyone sees case numbers, diseases and amounts, but not who the person is.
            {p.lastToggle && <> Last changed {fmtDateTime(p.lastToggle.at)} by {p.lastToggle.by}.</>}
          </p>
        </div>
        <GlobalSwitch on={p.global} readOnly={!can(ctx, "meetingMode.toggle")} />
      </div>
      <p className="mt-4 border-t border-rule pt-4 text-ui text-slate-body">
        To always hide names from one person (for example a visitor&apos;s account), tick &ldquo;Always hide names&rdquo; for them under Users.
      </p>
    </SheetPanel>
  );
}
