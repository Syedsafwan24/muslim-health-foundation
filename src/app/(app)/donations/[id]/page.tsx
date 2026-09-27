import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { donorOptions, getDonation } from "@/lib/db/queries/donations";
import { activeFunds } from "@/lib/db/queries/funds";
import { masterOptions } from "@/lib/db/queries/admin";
import { fmtDate, toDateInput } from "@/lib/fy";
import { amountInWords, formatINR } from "@/lib/money";
import { PAYMENT_MODE } from "@/lib/labels";
import { Field, PageHeader, Pill, SheetPanel } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { DonationActions, DonationDialog } from "../donation-forms";

export const metadata: Metadata = { title: "Donation" };

export default async function DonationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("donations.read");
  const { id } = await params;
  const d = await getDonation(ctx, id);
  if (!d) notFound();
  const canEdit = can(ctx, "donations.write") && !d.cancelledAt && !d.isReceiptIssued;
  const [donors, funds, m] = canEdit ? await Promise.all([donorOptions(ctx), activeFunds("donation"), masterOptions()]) : [[], [], null];
  return (
    <>
      <PageHeader
        back={{ href: "/donations", label: "Donations" }}
        title={<span className="font-mono">{d.receiptNo}</span>}
        meta={<>{d.cancelledAt ? <Pill tone="rejected">Cancelled</Pill> : d.isReceiptIssued ? <Pill tone="approved">Receipt issued</Pill> : <Pill tone="pending">Receipt not issued</Pill>}</>}
        actions={
          <>
            {!d.cancelledAt && <Button variant="outline" asChild><a href={`/api/export/receipt?id=${d.id}`} target="_blank" rel="noopener"><Printer aria-hidden /> Print receipt</a></Button>}
            {canEdit && m && (
              <DonationDialog
                donors={donors}
                funds={funds.map((f) => ({ id: f.id, name: f.name }))}
                banks={m.banks}
                initial={{
                  id: d.id, receiptNo: d.receiptNo, donorId: d.donor.id, fundId: d.fundId, amountPaise: d.amountPaise, donationDate: toDateInput(d.donationDate),
                  mode: d.mode, bankId: d.bankId ?? "", referenceNo: d.referenceNo ?? "", chequeNo: d.chequeNo ?? "", purposeNote: d.purposeNote ?? "", earmarkCaseNo: d.earmark?.caseNo ?? "",
                }}
              />
            )}
            {can(ctx, "donations.write") && <DonationActions id={d.id} receiptNo={d.receiptNo} cancelled={!!d.cancelledAt} issued={d.isReceiptIssued} />}
          </>
        }
      />
      <SheetPanel rule={d.cancelledAt ? "rejected" : "zakat"}>
        <p className={`text-display tabular-nums ${d.cancelledAt ? "text-slate-body line-through" : "text-navy-900"}`}>{formatINR(d.amountPaise)}</p>
        <p className="mt-1 text-label text-slate-body">{amountInWords(d.amountPaise)}</p>
        <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <Field label="Donor"><Link href={`/donations/donors/${d.donor.id}`} className="text-info hover:underline">{d.donor.name}</Link> <span className="font-mono text-caption text-slate-body">{d.donor.donorCode}</span></Field>
          <Field label="Date">{fmtDate(d.donationDate)}</Field>
          <Field label="Fund">{d.fundName}</Field>
          <Field label="Mode">{PAYMENT_MODE[d.mode]}</Field>
          <Field label="Bank">{d.bankName}</Field>
          <Field label="Cheque / reference" mono>{d.chequeNo ?? d.referenceNo}</Field>
          <Field label="Purpose">{d.purposeNote}</Field>
          <Field label="For case">{d.earmark ? <Link href={`/applications/${d.earmark.id}`} className="font-mono text-info hover:underline">{d.earmark.caseNo}</Link> : null}</Field>
          {d.cancelledAt && <Field label="Cancelled">{`${fmtDate(d.cancelledAt)} — ${d.cancelReason ?? ""}`}</Field>}
        </dl>
      </SheetPanel>
    </>
  );
}
