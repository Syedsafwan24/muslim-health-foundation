"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, UserError } from "@/lib/action";
import { includeDeleted } from "@/lib/db";
import { assertPermission, can, ForbiddenError } from "@/lib/auth/permissions";
import { requireViewContext } from "@/lib/auth/context";
import { verifyPassword } from "@/lib/auth";
import { diff } from "@/lib/audit";
import { fromDateInput } from "@/lib/fy";
import { fyOfDate } from "@/lib/fy/db";
import { fiscalYearFor, nextCaseNo } from "@/lib/numbering";
import { getSetting } from "@/lib/settings";
import { mentionsNames } from "@/lib/redact";
import { createPayment, lockApplication, moveStatus, savePerson, syncPaymentStatus } from "@/lib/db/writes";
import { LIVE_PAYMENT } from "@/lib/db/queries/shared";
import { formatINR } from "@/lib/money";
import { priorAid } from "@/lib/db/queries/applications";
import { findDuplicates, getPersonForEdit } from "@/lib/db/queries/people";
import { EDITABLE, STATUS_LABEL } from "@/lib/applications/transitions";
import {
  applicationSchema, id, missingRequired, personSchema, recordCaseSchema, REQUIRED, revealSchema,
} from "@/lib/validators";

const dateOrNull = (s: string | null) => (s ? fromDateInput(s) : null);

/** Duplicate check before a new person is saved (read-only). */
export async function checkDuplicates(raw: z.input<typeof personSchema>) {
  const ctx = await requireViewContext();
  assertPermission(ctx, "people.write");
  if (ctx.meetingMode) return [];
  const input = personSchema.safeParse(raw);
  if (!input.success || input.data.personId) return [];
  return findDuplicates(input.data);
}

/**
 * Create or update a draft / editable application with its applicant and patient.
 * Autosave calls this every 20 seconds.
 */
export const saveApplication = action("applications.write", applicationSchema, async (input, { ctx, tx, audit }) => {
  if (ctx.meetingMode) throw new UserError("Identities are hidden right now, so applications cannot be edited. Ask the super admin to turn meeting mode off.");

  let existing = null;
  if (input.id) {
    existing = await tx.application.findFirst({ where: { id: input.id } });
    if (!existing) throw new UserError("That case no longer exists.");
    if (!EDITABLE(existing.status)) throw new UserError(`Case ${existing.caseNo} is ${STATUS_LABEL[existing.status].toLowerCase()} and can no longer be edited.`);
  }

  const applicant = await savePerson(tx, input.applicant, audit);
  const patient = input.patientIsApplicant || !input.patient ? applicant : await savePerson(tx, input.patient, audit);

  const c = input.case;
  const e = input.eligibility;
  const data = {
    ...(input.applicationDate ? { applicationDate: fromDateInput(input.applicationDate) } : {}),
    applicantId: applicant.id,
    patientId: patient.id,
    patientIsApplicant: input.patientIsApplicant,
    relation: input.patientIsApplicant ? ("SELF" as const) : input.relation,
    dependentCount: input.dependentCount,
    introducedByName: c.introducedByName,
    introducedByPhone: c.introducedByPhone,
    attendingDoctor: c.attendingDoctor,
    hospitalId: c.hospitalId,
    diseaseId: c.diseaseId,
    majorProblem: c.majorProblem,
    admissionDate: dateOrNull(c.admissionDate),
    dischargeDate: dateOrNull(c.dischargeDate),
    approxExpensePaise: c.approxExpensePaise,
    requestedAmountPaise: c.requestedAmountPaise,
    approvedAmountPaise: c.approvedAmountPaise,
    priority: c.priority,
    zakatCategory: e.zakatCategory,
    monthlyIncomePaise: e.monthlyIncomePaise,
    dependentsSupported: e.dependentsSupported,
    ownsHouse: e.ownsHouse,
    ownsAgriLand: e.ownsAgriLand,
    savingsOrGoldNote: e.savingsOrGoldNote,
    existingDebtPaise: e.existingDebtPaise,
    eligibilityNote: e.eligibilityNote,
    authorisationReceived: e.authorisationReceived,
  };

  let appId: string;
  let caseNo: string;
  if (existing) {
    if (existing.status !== "DRAFT") {
      if (!data.approvedAmountPaise) throw new UserError("A recorded case needs its approved amount.");
      // Changing what the trust approved is a decision, not data entry.
      if (data.approvedAmountPaise !== existing.approvedAmountPaise && !can(ctx, "applications.decide")) {
        throw new UserError(`Only the general secretary can change the approved amount of case ${existing.caseNo}.`);
      }
      await lockApplication(tx, existing.id);
      const paid = (await tx.payment.aggregate({ where: { ...LIVE_PAYMENT, applicationId: existing.id }, _sum: { amountPaise: true } }))._sum.amountPaise ?? 0n;
      if (data.approvedAmountPaise < paid) throw new UserError(`${formatINR(paid)} has already been paid on case ${existing.caseNo}. The approved amount cannot be lower.`);
    }
    const d = diff(existing as unknown as Record<string, unknown>, data);
    // Any change to the eligibility block voids a previous verification.
    const eligibilityKeys = ["zakatCategory", "monthlyIncomePaise", "dependentsSupported", "ownsHouse", "ownsAgriLand", "savingsOrGoldNote", "existingDebtPaise"];
    const voidVerification = existing.eligibilityVerifiedAt && eligibilityKeys.some((k) => k in d.after);
    await tx.application.update({
      where: { id: existing.id },
      data: { ...data, ...(voidVerification ? { eligibilityVerifiedAt: null, eligibilityVerifiedById: null } : {}) },
    });
    if (Object.keys(d.after).length) {
      await audit({ action: "UPDATE", entity: "Application", entityId: existing.id, summary: `Updated case ${existing.caseNo}`, before: d.before, after: d.after });
    } else {
      await audit({ action: "UPDATE", entity: "Application", entityId: existing.id, summary: `Saved case ${existing.caseNo} (no changes)` });
    }
    // A changed approved amount can make the case fully paid, or no longer fully paid.
    if (existing.status !== "DRAFT") await syncPaymentStatus(tx, existing.id, ctx.userId, "Approved amount changed");
    appId = existing.id;
    caseNo = existing.caseNo;
  } else {
    const draftNo = `DRAFT/${randomBytes(5).toString("hex").toUpperCase()}`;
    const app = await tx.application.create({
      data: { ...data, caseNo: draftNo, fiscalYear: (await fyOfDate(new Date(), tx)) ?? "", serial: 0, status: "DRAFT", createdById: ctx.userId },
    });
    await tx.applicationStatusHistory.create({ data: { applicationId: app.id, toStatus: "DRAFT", changedById: ctx.userId } });
    await audit({ action: "CREATE", entity: "Application", entityId: app.id, summary: `Started draft ${draftNo}` });
    appId = app.id;
    caseNo = draftNo;
  }

  const names = [input.applicant.fullName, input.applicant.fatherName, input.patient?.fullName, input.patient?.fatherName];
  return {
    id: appId,
    caseNo,
    applicantId: applicant.id,
    applicantCode: applicant.personCode,
    patientId: patient.id,
    patientCode: patient.personCode,
    // Clerk warning: the free text mentions a name and would need scrubbing in Meeting Mode.
    nameInProblem: mentionsNames(c.majorProblem, names),
  };
});

/**
 * DRAFT → APPROVED. The trust has already approved the case, so completing the entry records it:
 * checks the required fields and documents, assigns the case number, stamps who recorded it.
 */
export const submitApplication = action("applications.write", recordCaseSchema, async ({ id, payment }, { ctx, tx, audit }) => {
  // Recording the cheque is a payment: only roles that may pay (not operators) can fill Block D.
  if (payment) assertPermission(ctx, "payments.write");
  // Lock the draft so a double click cannot record it twice (and burn a second case number).
  await lockApplication(tx, id);
  const a = await tx.application.findFirst({ where: { id }, include: { applicant: true, patient: true, attachments: { where: { deletedAt: null }, select: { type: true } } } });
  if (!a) throw new UserError("That case no longer exists.");
  if (a.status !== "DRAFT") throw new UserError(`Case ${a.caseNo} has already been recorded.`);
  const gaps = [
    ...missingRequired(a.applicant, REQUIRED.applicant).map((k) => `applicant's ${REQUIRED.applicant[k as keyof typeof REQUIRED.applicant]}`),
    ...(a.patientIsApplicant ? [] : missingRequired(a.patient, REQUIRED.patient).map((k) => `patient's ${REQUIRED.patient[k as keyof typeof REQUIRED.patient]}`)),
    ...missingRequired(a, REQUIRED.case).map((k) => REQUIRED.case[k as keyof typeof REQUIRED.case]),
    ...(a.approvedAmountPaise ? [] : ["approved amount (INR)"]),
  ];
  if (gaps.length) throw new UserError(`Fill in the ${gaps.join(", ")} before saving the case.`);

  const fy = await fiscalYearFor(tx, a.applicationDate);
  const { caseNo, serial } = await nextCaseNo(tx, fy);
  await tx.application.update({ where: { id }, data: { caseNo, serial, fiscalYear: fy, decidedById: ctx.userId, decidedAt: new Date() } });
  await moveStatus(tx, id, "APPROVED", ctx.userId);
  await audit({ action: "APPROVE", entity: "Application", entityId: id, summary: `Recorded approved case ${caseNo}`, after: { status: "APPROVED", caseNo, approvedAmountPaise: a.approvedAmountPaise } });
  // Block D filled in: the cheque for the approved amount is recorded with the case.
  if (payment) {
    await createPayment(tx, ctx.userId, id, { ...payment, amountPaise: a.approvedAmountPaise! }, audit);
  }
  revalidatePath("/applications");
  return { caseNo };
});


export const deleteDraft = action("applications.write", z.object({ id }), async ({ id }, { tx, audit }) => {
  const a = await tx.application.findFirst({ where: { id } });
  if (!a) throw new UserError("That draft no longer exists.");
  if (a.status !== "DRAFT") throw new UserError("Only drafts can be discarded. A recorded case is final.");
  await tx.application.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "DELETE", entity: "Application", entityId: id, summary: `Discarded draft ${a.caseNo}` });
  revalidatePath("/applications");
  return { id };
});

// ─────────────────────────── reveal identity ───────────────────────────

export const revealIdentity = action("identity.reveal", revealSchema, async ({ applicationId, reason, password }, { ctx, tx, audit }) => {
  if (!(await verifyPassword(ctx.userId, password))) throw new UserError("That password is not correct.");
  const a = await tx.application.findFirst({ where: { id: applicationId }, select: { caseNo: true } });
  if (!a) throw new UserError("That case no longer exists.");
  const minutes = await getSetting("reveal.minutes", tx);
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  await tx.revealGrant.create({ data: { userId: ctx.userId, applicationId, reason, expiresAt } });
  await audit({ action: "REVEAL_IDENTITY", entity: "Application", entityId: applicationId, summary: `Identity revealed for case ${a.caseNo}`, reason });
  revalidatePath(`/applications/${applicationId}`);
  return { expiresAt };
});

export const endReveal = action("identity.reveal", z.object({ applicationId: id }), async ({ applicationId }, { ctx, tx, audit }) => {
  const n = await tx.revealGrant.updateMany({ where: { userId: ctx.userId, applicationId, endedAt: null, expiresAt: { gt: new Date() } }, data: { endedAt: new Date() } });
  const a = await tx.application.findFirst({ where: { id: applicationId }, select: { caseNo: true } });
  await audit({ action: "UPDATE", entity: "Application", entityId: applicationId, summary: `Ended identity reveal for case ${a?.caseNo ?? ""} (${n.count} grant)` });
  revalidatePath(`/applications/${applicationId}`);
  return { ended: n.count };
});

/** Fill a person block from the registry when the clerk picks an existing person (read-only). */
export async function loadPerson(personId: string) {
  const ctx = await requireViewContext();
  assertPermission(ctx, "people.write");
  const p = await getPersonForEdit(ctx, personId); // null in Meeting Mode
  if (!p || p.isRedacted) return null;
  const aid = await priorAid(p.id);
  return {
    person: {
      personId: p.id, fullName: p.fullName, fatherName: p.fatherName ?? "", husbandName: p.husbandName ?? "", gender: p.gender ?? undefined,
      ageYears: p.age ?? "", maritalStatus: p.maritalStatus, religion: p.religion ?? "", mobile: p.mobile ?? "", altMobile: p.altMobile ?? "",
      addressLine: p.addressLine ?? "", areaId: p.areaId ?? "", city: p.city ?? "", pincode: p.pincode ?? "", idType: p.idType, idNumber: "",
    },
    personCode: p.personCode,
    idNumberLast4: p.idNumberLast4,
    cases: aid.cases,
    totalPaise: aid.totalPaise,
    watchFlag: p.watchFlag,
  };
}

/** "+ Add new disease" from the application form. Clerks may add; the master list stays deduplicated. */
export const addDisease = action("applications.write", z.object({ name: z.string().trim().min(2, "Enter the disease").max(120), categoryId: id }), async ({ name, categoryId }, { tx, audit }) => {
  const category = await tx.diseaseCategory.findFirst({ where: { id: categoryId } });
  if (!category) throw new UserError("Choose the category.");
  const existing = await tx.disease.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...includeDeleted }, include: { category: true } });
  if (existing?.deletedAt) {
    await tx.disease.update({ where: { id: existing.id }, data: { deletedAt: null } });
    await audit({ action: "RESTORE", entity: "Disease", entityId: existing.id, summary: `Restored disease ${existing.name}` });
  }
  if (existing) return { id: existing.id, label: `${existing.name} (${existing.category.name})` };
  const d = await tx.disease.create({ data: { name, categoryId } });
  await audit({ action: "CREATE", entity: "Disease", entityId: d.id, summary: `Added disease ${name} (${category.name})` });
  return { id: d.id, label: `${d.name} (${category.name})` };
});

/** "+ Add new category" from the add-disease pop-up. Deduplicated by name. */
export const addDiseaseCategory = action("applications.write", z.object({ name: z.string().trim().min(2, "Enter the category").max(80) }), async ({ name }, { tx, audit }) => {
  // Names are unique even among removed rows, so a removed category is brought back instead.
  const existing = await tx.diseaseCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...includeDeleted } });
  if (existing?.deletedAt) {
    await tx.diseaseCategory.update({ where: { id: existing.id }, data: { deletedAt: null } });
    await audit({ action: "RESTORE", entity: "DiseaseCategory", entityId: existing.id, summary: `Restored disease category ${existing.name}` });
  }
  if (existing) return { id: existing.id, name: existing.name };
  const last = await tx.diseaseCategory.aggregate({ _max: { sortOrder: true } });
  const c = await tx.diseaseCategory.create({ data: { name, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  await audit({ action: "CREATE", entity: "DiseaseCategory", entityId: c.id, summary: `Added disease category ${name}` });
  return { id: c.id, name: c.name };
});

/** "+ Add new bank" from the payment step. Bank names are unique, so a removed bank is brought back. */
export const addBank = action("applications.read", z.object({ name: z.string().trim().min(2, "Enter the bank name").max(120), branch: z.string().trim().max(120) }), async ({ name, branch }, { ctx, tx, audit }) => {
  if (!can(ctx, "applications.write") && !can(ctx, "payments.write")) throw new ForbiddenError();
  const label = (b: { name: string; branch: string | null }) => (b.branch ? `${b.name}, ${b.branch}` : b.name);
  const existing = await tx.bank.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...includeDeleted } });
  if (existing?.deletedAt) {
    await tx.bank.update({ where: { id: existing.id }, data: { deletedAt: null } });
    await audit({ action: "RESTORE", entity: "Bank", entityId: existing.id, summary: `Restored bank ${existing.name}` });
  }
  if (existing) return { id: existing.id, label: label(existing) };
  const b = await tx.bank.create({ data: { name, branch: branch || null } });
  await audit({ action: "CREATE", entity: "Bank", entityId: b.id, summary: `Added bank ${name}` });
  return { id: b.id, label: label(b) };
});
