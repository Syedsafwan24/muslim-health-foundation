import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listUsers, privacySettings } from "@/lib/db/queries/admin";
import { fmtDateTime } from "@/lib/fy";
import { SheetPanel } from "@/components/app/bits";
import { Switch } from "@/components/ui/switch";
import { GlobalSwitch, PinnedAccounts, RevealMinutes } from "../settings-forms";

export const metadata: Metadata = { title: "Privacy and meeting mode" };

function Row({ title, help, control }: { title: string; help: React.ReactNode; control: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div>
        <p className="text-body font-medium text-navy-900">{title}</p>
        <div className="mt-0.5 max-w-[68ch] text-ui text-slate-body">{help}</div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

const Locked = () => (
  <span className="flex items-center gap-2 text-caption text-slate-body"><Switch checked disabled aria-label="Always on" /> <Lock aria-hidden className="size-3.5" /> locked</span>
);

export default async function PrivacySettings() {
  const ctx = await requirePage("settings.read");
  const [p, users] = await Promise.all([privacySettings(ctx), listUsers(ctx)]);
  const canToggle = can(ctx, "meetingMode.toggle");
  const active = users.filter((u) => u.isActive);
  return (
    <div className="space-y-6">
      <SheetPanel title="Privacy and meeting mode" rule="redacted">
        <p className="max-w-[68ch] text-ui text-slate-body">Meeting mode hides the identity of patients and applicants so cases can be discussed on their facts. Case numbers, person codes, medical and financial details stay visible.</p>
        <div className="mt-2 divide-y divide-rule">
          <Row
            title="Hide identities for everyone"
            help={<>Applies to every user, including you, until you turn it off.<br />Currently: {p.global ? "on" : "off"}{p.lastToggle && <> · last changed {fmtDateTime(p.lastToggle.at)} by {p.lastToggle.by}</>}</>}
            control={<GlobalSwitch on={p.global} readOnly={!canToggle} />}
          />
          <Row title="Present view is always hidden" help="The full-screen meeting view can never show identities." control={<Locked />} />
        </div>
      </SheetPanel>

      <SheetPanel title="Accounts that always see hidden identities">
        <p className="mb-4 max-w-[68ch] text-ui text-slate-body">Use this when someone needs to browse the system without seeing who the cases are — a visitor, an auditor, or a committee member&apos;s own login.</p>
        <PinnedAccounts
          readOnly={!canToggle}
          pinned={active.filter((u) => u.forceMeetingMode).map((u) => ({ id: u.id, name: u.name, role: u.role }))}
          others={active.filter((u) => !u.forceMeetingMode).map((u) => ({ id: u.id, name: u.name, role: u.role }))}
        />
      </SheetPanel>

      <SheetPanel title="Hidden fields">
        <p className="text-ui text-navy-900">Name · Father name · Husband name · Address · Area · Mobile · Religion · ID number · Exact age · Photo · Documents that show identity · Introduced by · Attending doctor · Verifier&apos;s note · Payee name</p>
        <p className="mt-2 text-ui text-slate-body">Exact age is replaced by an age band. Person codes stay visible. Names written into the major problem are replaced before the text leaves the server. This list is fixed so it cannot be weakened by mistake.</p>
      </SheetPanel>

      <SheetPanel title="Revealing one identity">
        <p className="max-w-[68ch] text-ui text-slate-body">Only the super admin can reveal an identity, one case at a time. This cannot be granted to another role.</p>
        <div className="mt-2 divide-y divide-rule">
          <Row title="Require a written reason" help="At least 10 characters, stored in the audit log and shown on the case history." control={<Locked />} />
          <Row title="Require password re-entry" help="The super admin types their password for every reveal." control={<Locked />} />
          <Row title="Reveal expires after" help="The case goes back to hidden automatically." control={<RevealMinutes minutes={p.revealMinutes} readOnly={!can(ctx, "settings.write")} />} />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <h4 className="text-label">Recent reveals</h4>
          <Link href="/settings/audit?action=REVEAL_IDENTITY" className="text-label text-info hover:underline">View audit log</Link>
        </div>
        <ul className="mt-2 divide-y divide-rule text-ui">
          {p.reveals.length === 0 && <li className="py-2 text-slate-body">No identities have been revealed.</li>}
          {p.reveals.map((r) => (
            <li key={r.id} className="py-2">{fmtDateTime(r.at)} · {r.by} · {r.summary.replace("Identity revealed for case ", "")} · <span className="text-slate-body">&ldquo;{r.reason}&rdquo;</span></li>
          ))}
        </ul>
      </SheetPanel>
    </div>
  );
}
