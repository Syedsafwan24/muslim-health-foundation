"use server";

import { revalidatePath } from "next/cache";
import { action, UserError } from "@/lib/action";
import { fromDateInput } from "@/lib/fy";
import { fiscalYearFor, nextVoucherNo } from "@/lib/numbering";
import { createPayment, syncPaymentStatus } from "@/lib/db/writes";
import { z } from "zod";
import { clearSchema, id, paymentSchema, reasonSchema } from "@/lib/validators";

export const recordPayment = action("payments.write", paymentSchema, async (input, { ctx, tx, audit }) => {
  const r = await createPayment(tx, ctx.userId, input.applicationId, input, audit);
  revalidatePath(`/applications/${input.applicationId}`);
  revalidatePath("/payments");
  return r;
});

export const markIssued = action("payments.write", z.object({ id }), async ({ id }, { tx, audit }) => {
  const p = await tx.payment.findFirst({ where: { id } });
  if (!p) throw new UserError("That payment no longer exists.");
  if (p.status !== "PENDING") throw new UserError(`Payment ${p.voucherNo} is already ${p.status.toLowerCase()}.`);
  await tx.payment.update({ where: { id }, data: { status: "ISSUED" } });
  await audit({ action: "UPDATE", entity: "Payment", entityId: id, summary: `Issued payment ${p.voucherNo}`, before: { status: p.status }, after: { status: "ISSUED" } });
  revalidatePath("/payments");
  return { id };
});

/** Bulk reconcile against a bank statement. */
export const markCleared = action("payments.write", clearSchema, async ({ ids, clearedOn }, { tx, audit }) => {
  const rows = await tx.payment.findMany({ where: { id: { in: ids } } });
  const bad = rows.filter((p) => p.status !== "ISSUED" && p.status !== "PENDING");
  if (bad.length) throw new UserError(`${bad.map((p) => p.voucherNo).join(", ")} cannot be cleared because ${bad.length === 1 ? "it is" : "they are"} not issued.`);
  const clearedAt = fromDateInput(clearedOn);
  for (const p of rows) {
    await tx.payment.update({ where: { id: p.id }, data: { status: "CLEARED", clearedAt } });
    await audit({ action: "UPDATE", entity: "Payment", entityId: p.id, summary: `Cleared payment ${p.voucherNo}`, before: { status: p.status }, after: { status: "CLEARED", clearedAt } });
  }
  revalidatePath("/payments");
  return { count: rows.length };
});

export const markBounced = action("payments.write", reasonSchema, async ({ id, reason }, { ctx, tx, audit }) => {
  const p = await tx.payment.findFirst({ where: { id }, include: { application: { select: { id: true, caseNo: true } } } });
  if (!p) throw new UserError("That payment no longer exists.");
  if (p.status !== "ISSUED") throw new UserError(`Only an issued cheque can bounce. Payment ${p.voucherNo} is ${p.status.toLowerCase()}.`);
  await tx.payment.update({ where: { id }, data: { status: "BOUNCED", bouncedReason: reason } });
  // Follow-up note on the case so the bounce is visible where the work happens.
  await tx.applicationStatusHistory.create({
    data: { applicationId: p.applicationId, fromStatus: null, toStatus: (await tx.application.findFirstOrThrow({ where: { id: p.applicationId } })).status, note: `Follow up: payment ${p.voucherNo} bounced — ${reason}`, changedById: ctx.userId },
  });
  await audit({ action: "CANCEL_PAYMENT", entity: "Payment", entityId: id, summary: `Payment ${p.voucherNo} on case ${p.application.caseNo} bounced`, reason });
  await syncPaymentStatus(tx, p.applicationId, ctx.userId, `Payment ${p.voucherNo} bounced`);
  revalidatePath(`/applications/${p.applicationId}`);
  revalidatePath("/payments");
  return { id };
});

/** Never deletes. A cleared payment is reversed with a counter-entry; anything earlier is cancelled. */
export const cancelPayment = action("payments.write", reasonSchema, async ({ id, reason }, { ctx, tx, audit }) => {
  const p = await tx.payment.findFirst({ where: { id }, include: { application: { select: { caseNo: true } } } });
  if (!p) throw new UserError("That payment no longer exists.");
  if (p.reversalOfId) throw new UserError("A reversal entry cannot itself be cancelled.");
  if (p.status === "CANCELLED" || p.status === "BOUNCED") throw new UserError(`Payment ${p.voucherNo} is already ${p.status.toLowerCase()}.`);
  if (await tx.payment.findFirst({ where: { reversalOfId: p.id } })) throw new UserError(`Payment ${p.voucherNo} has already been reversed.`);

  if (p.status === "CLEARED") {
    const voucherNo = await nextVoucherNo(tx, await fiscalYearFor(tx, new Date()));
    const r = await tx.payment.create({
      data: {
        voucherNo, applicationId: p.applicationId, fundId: p.fundId, amountPaise: -p.amountPaise, mode: p.mode,
        chequeNo: p.chequeNo, bankId: p.bankId, referenceNo: p.referenceNo, paymentDate: new Date(), towards: p.towards,
        payeeType: p.payeeType, hospitalId: p.hospitalId, payeeName: p.payeeName, status: "CLEARED", clearedAt: new Date(),
        reversalOfId: p.id, remark: `Reversal of ${p.voucherNo}: ${reason}`, createdById: ctx.userId,
      },
    });
    await audit({ action: "CANCEL_PAYMENT", entity: "Payment", entityId: p.id, summary: `Reversed payment ${p.voucherNo} on case ${p.application.caseNo} with ${voucherNo}`, reason, after: { reversalId: r.id } });
  } else {
    await tx.payment.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit({ action: "CANCEL_PAYMENT", entity: "Payment", entityId: p.id, summary: `Cancelled payment ${p.voucherNo} on case ${p.application.caseNo}`, reason, before: { status: p.status }, after: { status: "CANCELLED" } });
  }
  await syncPaymentStatus(tx, p.applicationId, ctx.userId, `Payment ${p.voucherNo} cancelled`);
  revalidatePath(`/applications/${p.applicationId}`);
  revalidatePath("/payments");
  return { id };
});
