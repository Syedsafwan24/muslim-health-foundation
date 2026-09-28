"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, UserError } from "@/lib/action";
import { verifyPassword } from "@/lib/auth";
import type { Tx } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { LIVE_PAYMENT } from "@/lib/db/queries/shared";
import { id } from "@/lib/validators";

// Super-admin deletes for records entered by mistake (e.g. test entries). Nothing is erased
// (CLAUDE.md rule 3): the row gets deletedAt, disappears from every list and report, and the
// audit log keeps who deleted it, when and why. Each delete is refused while the record is in use.

const input = z.object({
  id,
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
  password: z.string().min(1, "Enter your password"),
});

async function confirm(ctx: { userId: string; meetingMode: boolean }, password: string) {
  if (ctx.meetingMode) throw new UserError("Turn off hidden names first, so you can see what you are deleting.");
  if (!(await verifyPassword(ctx.userId, password))) throw new UserError("That password is not correct.");
}

async function lockRow(tx: Tx, table: "Application" | "Person" | "Hospital", rowId: string) {
  if (table === "Application") await tx.$queryRaw`SELECT id FROM "Application" WHERE id = ${rowId} FOR UPDATE`;
  if (table === "Person") await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${rowId} FOR UPDATE`;
  if (table === "Hospital") await tx.$queryRaw`SELECT id FROM "Hospital" WHERE id = ${rowId} FOR UPDATE`;
}

/** A recorded case. Refused while it has a payment that is not cancelled (or fully reversed). */
export const deleteCase = action("records.delete", input, async ({ id, reason, password }, { ctx, tx, audit }) => {
  await confirm(ctx, password);
  await lockRow(tx, "Application", id);
  const a = await tx.application.findFirst({ where: { id } });
  if (!a) throw new UserError("That case has already been deleted.");
  if (a.status === "DRAFT") throw new UserError("This is an unfinished entry. Use Discard draft instead.");
  const [open, net] = await Promise.all([
    tx.payment.count({ where: { applicationId: id, status: { in: ["PENDING", "ISSUED"] }, deletedAt: null } }),
    tx.payment.aggregate({ where: { ...LIVE_PAYMENT, applicationId: id }, _sum: { amountPaise: true } }),
  ]);
  const paid = net._sum.amountPaise ?? 0n;
  if (open || paid !== 0n) {
    throw new UserError(`Case ${a.caseNo} has payments${paid ? ` of ${formatINR(paid)}` : ""}. Cancel them on its Payments tab first.`);
  }
  await tx.application.update({ where: { id }, data: { deletedAt: new Date() } });
  await tx.attachment.updateMany({ where: { applicationId: id, deletedAt: null }, data: { deletedAt: new Date() } });
  await audit({ action: "DELETE", entity: "Application", entityId: id, summary: `Deleted case ${a.caseNo}`, reason });
  revalidatePath("/applications");
  return { id };
});

/** A patient or applicant. Refused while they are on any case. */
export const deletePerson = action("records.delete", input, async ({ id, reason, password }, { ctx, tx, audit }) => {
  await confirm(ctx, password);
  await lockRow(tx, "Person", id);
  const p = await tx.person.findFirst({ where: { id } });
  if (!p) throw new UserError("That person has already been deleted.");
  const cases = await tx.application.count({ where: { OR: [{ applicantId: id }, { patientId: id }] } });
  if (cases) throw new UserError(`${p.personCode} is on ${cases} case${cases === 1 ? "" : "s"}. Delete or discard those first.`);
  await tx.person.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "DELETE", entity: "Person", entityId: id, summary: `Deleted person ${p.personCode}`, reason });
  revalidatePath("/patients");
  revalidatePath("/applicants");
  return { id };
});

/** A hospital. Refused while a case or payment uses it; an unused one can be deleted. */
export const deleteHospital = action("records.delete", input, async ({ id, reason, password }, { ctx, tx, audit }) => {
  await confirm(ctx, password);
  await lockRow(tx, "Hospital", id);
  const h = await tx.hospital.findFirst({ where: { id } });
  if (!h) throw new UserError("That hospital has already been deleted.");
  const [cases, payments] = await Promise.all([
    tx.application.count({ where: { hospitalId: id } }),
    tx.payment.count({ where: { hospitalId: id, deletedAt: null } }),
  ]);
  if (cases || payments) {
    throw new UserError(`${h.name} is used by ${[cases && `${cases} case${cases === 1 ? "" : "s"}`, payments && `${payments} payment${payments === 1 ? "" : "s"}`].filter(Boolean).join(" and ")}. Untick Active under Edit hospital to hide it instead.`);
  }
  await tx.hospital.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "DELETE", entity: "Hospital", entityId: id, summary: `Deleted hospital ${h.name}`, reason });
  revalidatePath("/hospitals");
  return { id };
});
