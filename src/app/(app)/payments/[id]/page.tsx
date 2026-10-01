import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getPayment } from "@/lib/db/queries/payments";
import { fmtDate, fmtDateTime } from "@/lib/fy";
import { amountInWords, formatINR } from "@/lib/money";
import { PAYEE_TYPE, PAYMENT_MODE, TOWARDS } from "@/lib/labels";
import { Field, PageHeader, PaymentStatusBadge, Pill, SheetPanel } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { PaymentRowActions } from "../../applications/[id]/case-client";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("payments.read");
  const { id } = await params;
  const p = await getPayment(ctx, id);
  if (!p) notFound();
  return (
    <>
      <PageHeader
        back={{ href: "/payments", label: "Payments" }}
        title={<span className="font-mono">{p.voucherNo}</span>}
        meta={<><PaymentStatusBadge status={p.status} />{p.isReversal && <Pill tone="slate">Reversal entry</Pill>}<span>for case <Link href={`/applications/${p.applicationId}`} className="font-mono text-info hover:underline">{p.caseNo}</Link></span></>}
        actions={
          <>
            {!p.isReversal && !p.reversed && p.status !== "CANCELLED" && p.status !== "BOUNCED" && (
              <Button variant="outline" asChild><a href={`/api/export/payment-receipt?id=${p.id}`} target="_blank" rel="noopener"><Printer aria-hidden /> Print receipt</a></Button>
            )}
            <Button variant="outline" asChild><a href={`/api/export/voucher?id=${p.id}`} target="_blank" rel="noopener"><Printer aria-hidden /> Print voucher</a></Button>
            <PaymentRowActions id={p.id} voucherNo={p.voucherNo} status={p.status} canManage={can(ctx, "payments.write") && !p.isReversal} />
          </>
        }
      />
      <SheetPanel title="Payment — Block D" rule={p.status === "CLEARED" ? "approved" : p.status === "BOUNCED" || p.status === "CANCELLED" ? "rejected" : "pending"}>
        <p className="text-display tabular-nums text-navy-900">{formatINR(p.amountPaise)}</p>
        <p className="mt-1 text-label text-slate-body">{amountInWords(p.amountPaise < 0n ? -p.amountPaise : p.amountPaise)}</p>
        <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <Field label="Mode of transfer">{PAYMENT_MODE[p.mode]}</Field>
          <Field label="Cheque" mono>{p.chequeNo}</Field>
          <Field label="Bank">{p.bankName}</Field>
          <Field label="Reference / UTR" mono>{p.referenceNo}</Field>
          <Field label="Payment date">{fmtDate(p.paymentDate)}</Field>
          <Field label="Towards">{TOWARDS[p.towards]}</Field>
          <Field label="Payee">{PAYEE_TYPE[p.payeeType] ?? p.payeeType}</Field>
          <Field label="Name of the hospital">{p.hospitalName}</Field>
          {p.payeeType !== "HOSPITAL" && <Field label="Payee name">{p.payeeName ?? (ctx.meetingMode ? "Hidden" : null)}</Field>}
          <Field label="Fund">{p.fundName}</Field>
          <Field label="Cleared">{p.clearedAt ? fmtDate(p.clearedAt) : null}</Field>
          <Field label="Recorded">{fmtDateTime(p.createdAt)}</Field>
          {p.bouncedReason && <Field label="Bounce reason" className="sm:col-span-3">{p.bouncedReason}</Field>}
          <Field label="Remark" className="sm:col-span-3">{p.remark}</Field>
        </dl>
      </SheetPanel>
    </>
  );
}
