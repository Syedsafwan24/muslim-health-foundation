import "server-only";
import type { ApplicationStatus, PaymentMode, PaymentTowards } from "@prisma/client";
import { UserError } from "@/lib/action";
import { formatINR } from "@/lib/money";
import { fromDateInput, fyRange, getFiscalYear } from "@/lib/fy";
import { nextVoucherNo } from "@/lib/numbering";
import { fundBalance } from "./queries/funds";
import type { z } from "zod";
import type { Tx } from "@/lib/db";
import { encryptId, identityHash } from "@/lib/crypto";
import { diff } from "@/lib/audit";
import { nextPersonCode } from "@/lib/numbering";
import { assertTransition, PAYABLE } from "@/lib/applications/transitions";
import type { personSchema } from "@/lib/validators";
import type { AuditEntry } from "@/lib/audit";
import { LIVE_PAYMENT } from "./queries/shared";

type AuditFn = (e: Omit<AuditEntry, "actorId">) => Promise<void>;

/** Create or update a Person from the form block. Returns the id and code. */
export async function savePerson(tx: Tx, input: z.output<typeof personSchema>, audit: AuditFn) {
  const { personId, idNumber, ageYears, ...fields } = input;
  const data = {
    ...fields,
    ageYears,
    identityHash: identityHash(fields.fullName, fields.mobile),
    ...(idNumber ? { idNumberEnc: encryptId(idNumber), idNumberLast4: idNumber.replace(/\s/g, "").slice(-4) } : {}),
  };
  if (personId) {
    const before = await tx.person.findFirstOrThrow({ where: { id: personId } });
    const changes = { ...data, ...(ageYears !== before.ageYears ? { ageRecordedAt: new Date() } : {}) };
    const d = diff(before as unknown as Record<string, unknown>, changes);
    if (Object.keys(d.after).length) {
      await tx.person.update({ where: { id: personId }, data: changes });
      // The diff is identity data; keep field names only so the audit log holds no PII.
      await audit({ action: "UPDATE", entity: "Person", entityId: personId, summary: `Updated person ${before.personCode}`, after: { fields: Object.keys(d.after).filter((k) => k !== "identityHash" && k !== "idNumberEnc") } });
    }
    return { id: personId, personCode: before.personCode };
  }
  const personCode = await nextPersonCode(tx);
  const p = await tx.person.create({ data: { ...data, personCode, ageRecordedAt: ageYears != null ? new Date() : null } });
  await audit({ action: "CREATE", entity: "Person", entityId: p.id, summary: `Registered person ${personCode}` });
  return { id: p.id, personCode };
}

/** Write a status change with its history row. */
export async function moveStatus(tx: Tx, appId: string, to: ApplicationStatus, userId: string, note?: string | null) {
  const a = await tx.application.findFirstOrThrow({ where: { id: appId }, select: { status: true } });
  if (a.status === to) return;
  assertTransition(a.status, to);
  await tx.application.update({ where: { id: appId }, data: { status: to } });
  await tx.applicationStatusHistory.create({ data: { applicationId: appId, fromStatus: a.status, toStatus: to, note: note ?? null, changedById: userId } });
}

/**
 * After any payment change: PAID when live payments cover the approved amount, otherwise
 * PAYMENT_PENDING. Cases not yet approved are left alone.
 */
export async function syncPaymentStatus(tx: Tx, appId: string, userId: string, note?: string) {
  const a = await tx.application.findFirstOrThrow({ where: { id: appId }, select: { status: true, approvedAmountPaise: true } });
  if (!["APPROVED", "PARTIALLY_APPROVED", "PAYMENT_PENDING", "PAID"].includes(a.status)) return;
  const sum = await tx.payment.aggregate({ where: { ...LIVE_PAYMENT, applicationId: appId }, _sum: { amountPaise: true } });
  const paid = sum._sum.amountPaise ?? 0n;
  const target: ApplicationStatus = a.approvedAmountPaise != null && paid >= a.approvedAmountPaise ? "PAID" : paid > 0n || a.status === "PAID" ? "PAYMENT_PENDING" : a.status;
  if (target !== a.status) await moveStatus(tx, appId, target, userId, note);
}

export type PaymentEntry = {
  mode: PaymentMode; chequeNo: string | null; bankId: string | null; paymentDate: string;
  towards: PaymentTowards; hospitalId: string | null; remark: string | null;
};

/**
 * Record one payment (Block D) against an approved case: fund chosen automatically while only
 * one is active, capped at the approved amount unless overridden, never overdrawing the fund.
 */
export async function createPayment(
  tx: Tx,
  userId: string,
  applicationId: string,
  p: PaymentEntry & { amountPaise: bigint; fundId?: string | null; overrideNote?: string | null },
  audit: AuditFn,
) {
  const app = await tx.application.findFirst({ where: { id: applicationId }, include: { applicant: { select: { fullName: true } } } });
  if (!app) throw new UserError("That case no longer exists.");
  if (!PAYABLE.includes(app.status)) throw new UserError(`Case ${app.caseNo} is not open for payment.`);

  const funds = await tx.fund.findMany({ where: { isActive: true } });
  const fund = p.fundId ? funds.find((f) => f.id === p.fundId) : funds.length === 1 ? funds[0] : null;
  if (!fund) throw new UserError(funds.length ? "Choose the fund this payment is drawn from." : "There is no active fund to pay from. Set one up in Settings.");

  const paid = (await tx.payment.aggregate({ where: { ...LIVE_PAYMENT, applicationId }, _sum: { amountPaise: true } }))._sum.amountPaise ?? 0n;
  const remaining = (app.approvedAmountPaise ?? 0n) - paid;
  if (p.amountPaise > remaining && !p.overrideNote) {
    throw new UserError(`Only ${formatINR(remaining > 0n ? remaining : 0n)} of the approved amount is left to pay on case ${app.caseNo}. Reduce the amount, or add an override note.`);
  }
  const balance = await fundBalance(fund.id, tx);
  if (p.amountPaise > balance) throw new UserError(`${fund.name} fund has ${formatINR(balance)} left. Reduce the amount or choose another fund.`);

  const paymentDate = fromDateInput(p.paymentDate);
  const voucherNo = await nextVoucherNo(tx, getFiscalYear(paymentDate));
  const toApplicant = p.towards === "APPLICANT_DIRECT";
  const row = await tx.payment.create({
    data: {
      voucherNo,
      applicationId,
      fundId: fund.id,
      amountPaise: p.amountPaise,
      mode: p.mode,
      // One "Cheque" field on the paper form: a cheque number, or the transfer reference.
      chequeNo: p.mode === "CHEQUE" || p.mode === "DD" ? p.chequeNo : null,
      referenceNo: p.mode === "CHEQUE" || p.mode === "DD" ? null : p.chequeNo,
      bankId: p.bankId,
      paymentDate,
      towards: p.towards,
      payeeType: toApplicant ? "APPLICANT" : "HOSPITAL",
      hospitalId: toApplicant ? null : p.hospitalId,
      payeeName: toApplicant ? app.applicant.fullName : null,
      remark: [p.remark, p.overrideNote && `Override: ${p.overrideNote}`].filter(Boolean).join(" · ") || null,
      status: "ISSUED",
      createdById: userId,
    },
  });
  await audit({ action: "PAY", entity: "Payment", entityId: row.id, summary: `Recorded payment ${voucherNo} of ${formatINR(p.amountPaise)} for case ${app.caseNo}`, after: { amountPaise: p.amountPaise, mode: p.mode, fund: fund.name } });
  await syncPaymentStatus(tx, applicationId, userId, `Payment ${voucherNo}`);

  // Warn (not block) when the fund drops below 10% of this year's inflow.
  const { start, end } = fyRange(getFiscalYear());
  const inflow = (await tx.donation.aggregate({ where: { fundId: fund.id, cancelledAt: null, donationDate: { gte: start, lt: end } }, _sum: { amountPaise: true } }))._sum.amountPaise ?? 0n;
  const after = balance - p.amountPaise;
  return { id: row.id, voucherNo, fundName: fund.name, fundBalanceAfter: after, lowBalance: after < inflow / 10n };
}
