"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, UserError } from "@/lib/action";
import type { Tx } from "@/lib/db";
import { diff } from "@/lib/audit";
import { formatINR } from "@/lib/money";
import { fromDateInput, getFiscalYear } from "@/lib/fy";
import { nextDonorCode, nextReceiptNo } from "@/lib/numbering";
import { donationSchema, donorSchema, id, reasonSchema } from "@/lib/validators";
import { fundBalance } from "@/lib/db/queries/funds";
import { lockFund } from "@/lib/db/writes";

/** Money already paid out of a fund cannot be taken back out of it by editing or cancelling a donation. */
async function assertNotOverdrawn(tx: Tx, fundId: string) {
  const balance = await fundBalance(fundId, tx);
  if (balance < 0n) {
    const f = await tx.fund.findFirst({ where: { id: fundId }, select: { name: true } });
    throw new UserError(`This would leave the ${f?.name ?? ""} fund at ${formatINR(balance)}. That money has already been paid out.`);
  }
}

export const saveDonor = action("donations.write", donorSchema, async ({ id, ...data }, { tx, audit }) => {
  if (id) {
    const before = await tx.donor.findFirst({ where: { id } });
    if (!before) throw new UserError("That donor no longer exists.");
    await tx.donor.update({ where: { id }, data });
    const d = diff(before as unknown as Record<string, unknown>, data);
    await audit({ action: "UPDATE", entity: "Donor", entityId: id, summary: `Updated donor ${before.donorCode}`, after: { fields: Object.keys(d.after) } });
    revalidatePath(`/donations/donors/${id}`);
    return { id, donorCode: before.donorCode };
  }
  const donorCode = await nextDonorCode(tx);
  const d = await tx.donor.create({ data: { ...data, donorCode } });
  await audit({ action: "CREATE", entity: "Donor", entityId: d.id, summary: `Registered donor ${donorCode}` });
  revalidatePath("/donations/donors");
  return { id: d.id, donorCode };
});

async function resolveFund(tx: Tx, fundId: string | null) {
  const funds = await tx.fund.findMany({ where: { isActive: true } });
  const fund = fundId ? funds.find((f) => f.id === fundId) : funds.length === 1 ? funds[0] : null;
  if (!fund) throw new UserError(funds.length ? "Choose the fund this donation is for." : "There is no active fund. Set one up in Settings.");
  return fund;
}

async function resolveEarmark(tx: Tx, caseNo: string | null) {
  if (!caseNo) return null;
  const a = await tx.application.findFirst({ where: { caseNo: caseNo.trim().toUpperCase() }, select: { id: true } });
  if (!a) throw new UserError(`No case ${caseNo} was found to earmark this donation for.`);
  return a.id;
}

export const saveDonation = action("donations.write", donationSchema, async (input, { ctx, tx, audit }) => {
  const fund = await resolveFund(tx, input.fundId);
  const data = {
    donorId: input.donorId,
    fundId: fund.id,
    amountPaise: input.amountPaise,
    donationDate: fromDateInput(input.donationDate),
    mode: input.mode,
    bankId: input.bankId,
    referenceNo: input.referenceNo,
    chequeNo: input.chequeNo,
    purposeNote: input.purposeNote,
    earmarkApplicationId: await resolveEarmark(tx, input.earmarkCaseNo),
  };
  if (input.id) {
    const before = await tx.donation.findFirst({ where: { id: input.id } });
    if (!before) throw new UserError("That donation no longer exists.");
    if (before.cancelledAt) throw new UserError(`Receipt ${before.receiptNo} is cancelled and cannot be edited.`);
    if (before.isReceiptIssued) throw new UserError(`Receipt ${before.receiptNo} has been issued. Cancel it and record the donation again.`);
    await lockFund(tx, before.fundId);
    await tx.donation.update({ where: { id: input.id }, data });
    await assertNotOverdrawn(tx, before.fundId);
    const d = diff(before as unknown as Record<string, unknown>, data);
    await audit({ action: "UPDATE", entity: "Donation", entityId: input.id, summary: `Updated donation ${before.receiptNo}`, before: d.before, after: d.after });
    revalidatePath("/donations");
    return { id: input.id, receiptNo: before.receiptNo };
  }
  const receiptNo = await nextReceiptNo(tx, getFiscalYear(data.donationDate));
  const d = await tx.donation.create({ data: { ...data, receiptNo, createdById: ctx.userId } });
  await audit({ action: "CREATE", entity: "Donation", entityId: d.id, summary: `Recorded donation ${receiptNo} of ${formatINR(input.amountPaise)} to ${fund.name}` });
  revalidatePath("/donations");
  return { id: d.id, receiptNo };
});

/** The receipt number is voided, never reassigned. */
export const cancelDonation = action("donations.write", reasonSchema, async ({ id, reason }, { tx, audit }) => {
  const d = await tx.donation.findFirst({ where: { id } });
  if (!d) throw new UserError("That donation no longer exists.");
  if (d.cancelledAt) throw new UserError(`Receipt ${d.receiptNo} is already cancelled.`);
  await lockFund(tx, d.fundId);
  await tx.donation.update({ where: { id }, data: { cancelledAt: new Date(), cancelReason: reason } });
  await assertNotOverdrawn(tx, d.fundId);
  await audit({ action: "DELETE", entity: "Donation", entityId: id, summary: `Cancelled receipt ${d.receiptNo}`, reason });
  revalidatePath("/donations");
  return { id };
});

export const issueReceipt = action("donations.write", z.object({ id }), async ({ id }, { tx, audit }) => {
  const d = await tx.donation.findFirst({ where: { id } });
  if (!d) throw new UserError("That donation no longer exists.");
  if (d.cancelledAt) throw new UserError(`Receipt ${d.receiptNo} is cancelled.`);
  await tx.donation.update({ where: { id }, data: { isReceiptIssued: true } });
  await audit({ action: "UPDATE", entity: "Donation", entityId: id, summary: `Issued receipt ${d.receiptNo}` });
  revalidatePath("/donations");
  return { receiptNo: d.receiptNo };
});
