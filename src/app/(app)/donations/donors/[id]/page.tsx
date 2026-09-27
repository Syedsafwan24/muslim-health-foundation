import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getDonor, getDonorForEdit } from "@/lib/db/queries/donations";
import { activeFunds } from "@/lib/db/queries/funds";
import { masterOptions } from "@/lib/db/queries/admin";
import { fmtDate } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import { DONOR_TYPE, PAYMENT_MODE } from "@/lib/labels";
import { Field, MoneyText, PageHeader, Pill, SheetPanel, StatCard } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { DonationDialog, DonorDialog } from "../../donation-forms";

export const metadata: Metadata = { title: "Donor" };

export default async function DonorPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("donations.read");
  const { id } = await params;
  const d = await getDonor(ctx, id);
  if (!d) notFound();
  const canWrite = can(ctx, "donations.write");
  const [raw, funds, m] = canWrite ? await Promise.all([getDonorForEdit(ctx, id), activeFunds("donation"), masterOptions()]) : [null, [], null];
  const donor = d.donor;
  const th = "px-3 py-2.5 text-label font-medium";
  return (
    <>
      <PageHeader
        back={{ href: "/donations/donors", label: "Donors" }}
        title={donor.name}
        meta={<><span className="font-mono">{donor.donorCode}</span> · {DONOR_TYPE[donor.type]}{donor.isAnonymous && <Pill tone="redacted">Anonymous</Pill>}</>}
        actions={
          <>
            <Button variant="outline" asChild><a href={`/api/export/donor-statement?id=${donor.id}`} target="_blank" rel="noopener"><Printer aria-hidden /> Annual statement</a></Button>
            {raw && (
              <DonorDialog initial={{
                id: raw.id, name: raw.name, type: raw.type, phone: raw.phone ?? "", email: raw.email ?? "", addressLine: raw.addressLine ?? "", city: raw.city ?? "",
                country: raw.country ?? "", panLast4: raw.panLast4 ?? "", isAnonymous: raw.isAnonymous, notes: raw.notes ?? "",
              }} />
            )}
            {canWrite && m && <DonationDialog donors={[{ id: donor.id, label: donor.name, hint: donor.donorCode }]} defaultDonorId={donor.id} funds={funds.map((f) => ({ id: f.id, name: f.name }))} banks={m.banks} />}
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Lifetime given" value={formatINR(d.lifetimePaise)} rule="zakat" />
        <StatCard label="Donations" value={String(d.donations.filter((x) => !x.cancelled).length)} />
        <StatCard label="Last donation" value={d.donations[0] ? fmtDate(d.donations[0].donationDate) : "—"} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-12">
        <SheetPanel title="Contact" className="xl:col-span-4">
          <dl className="space-y-3">
            <Field label="Phone">{donor.phone}</Field>
            <Field label="Email">{donor.email}</Field>
            <Field label="Address">{[donor.addressLine, donor.city, donor.country].filter(Boolean).join(", ")}</Field>
            <Field label="PAN">{donor.panLast4 ? `ending ${donor.panLast4}` : null}</Field>
            <Field label="Notes">{donor.notes}</Field>
          </dl>
        </SheetPanel>
        <SheetPanel title="Donation history" bodyClassName="p-0" className="xl:col-span-8">
          {d.donations.length === 0 ? <p className="px-5 py-6 text-ui text-slate-body">No donations yet.</p> : (
            <table className="w-full text-ui">
              <thead className="bg-navy-700 text-left text-white"><tr><th className={th}>Receipt</th><th className={th}>Date</th><th className={th}>Mode</th><th className={th}>Purpose</th><th className={`${th} text-right`}>Amount</th></tr></thead>
              <tbody>
                {d.donations.map((x) => (
                  <tr key={x.id} className={`h-[var(--row-h)] border-b border-rule ${x.cancelled ? "text-slate-body" : ""}`}>
                    <td className="px-3 font-mono text-mono-sm"><Link href={`/donations/${x.id}`} className="hover:underline">{x.receiptNo}</Link>{x.cancelled && <Pill tone="rejected" className="ml-2">Cancelled</Pill>}</td>
                    <td className="px-3"><time>{fmtDate(x.donationDate)}</time></td>
                    <td className="px-3">{PAYMENT_MODE[x.mode]}</td>
                    <td className="px-3">{x.purposeNote ?? "—"}</td>
                    <td className="px-3 text-right font-mono"><MoneyText paise={x.amountPaise} className={x.cancelled ? "line-through" : undefined} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SheetPanel>
      </div>
    </>
  );
}
