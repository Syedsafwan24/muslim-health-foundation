import "server-only";
import type { ApplicationStatus, AttachmentType, Gender, Prisma, Priority } from "@prisma/client";
import { subMonths } from "date-fns";
import { includeDeleted, prisma } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { currentAge, personRef, redactPerson, scrubNames, toAgeBand, type PersonRef, type PersonView, type ViewContext } from "@/lib/redact";
import { CASE_DOCUMENTS } from "@/lib/labels";
import { attachmentView, isMaskedFor, LIVE_PAYMENT, pageArgs, paidByApplication, PAGE_SIZE, type AttachmentView, type Page } from "./shared";
import { paymentView, type PaymentView } from "./payments";

export type ApplicationFilters = {
  q?: string;
  status?: ApplicationStatus[];
  fy?: string;
  hospitalId?: string;
  categoryId?: string;
  diseaseId?: string;
  areaId?: string;
  priority?: Priority;
  from?: Date;
  to?: Date;
  minPaise?: bigint;
  maxPaise?: bigint;
  mine?: boolean;
  pendingDocs?: boolean;
  repeat?: boolean;
  gender?: Gender;
  sort?: ApplicationSort;
  page?: number;
  /** Every matching row (exports); the page is ignored. */
  all?: boolean;
};
export const APPLICATION_SORTS = ["date", "-date", "approved", "-approved", "caseNo", "-caseNo", "patient", "-patient", "gender", "-gender", "age", "-age", "disease", "-disease", "hospital", "-hospital", "status", "-status"] as const;
export type ApplicationSort = (typeof APPLICATION_SORTS)[number];

export type ApplicationRow = {
  id: string;
  caseNo: string;
  applicationDate: Date;
  patient: PersonRef;
  gender: Gender | null;
  /** Exact age, or the age band while identities are hidden. */
  age: number | string | null;
  diseaseName: string | null;
  categoryName: string | null;
  hospitalName: string | null;
  requestedPaise: bigint | null;
  approvedPaise: bigint | null;
  paidPaise: bigint;
  status: ApplicationStatus;
  priority: Priority;
  watchFlag: boolean;
};

/** Required checklist entries → the attachment types that satisfy them. */
export const CHECKLIST: Record<string, { label: string; types: string[] }> = {
  GOVT_ID: { label: "Govt ID (Aadhaar or ration card)", types: ["GOVT_ID"] },
  HOSPITAL_BILL: { label: "Hospital bill or receipt", types: ["HOSPITAL_BILL", "RECEIPT"] },
  HOSPITAL_LETTER: { label: "Hospital letter", types: ["HOSPITAL_LETTER"] },
  MHF_APPLICATION_FORM: { label: "MHF form (signed)", types: ["MHF_APPLICATION_FORM"] },
  AUTHORISATION_FORM: { label: "Authorisation form", types: ["AUTHORISATION_FORM"] },
};

/** Documents a case is reminded about until they are uploaded (none blocks saving). */
const CASE_DOCUMENT_TYPES: string[] = CASE_DOCUMENTS.map((d) => d.type);

export async function missingDocuments(presentTypes: string[], required?: string[]): Promise<string[]> {
  required ??= CASE_DOCUMENT_TYPES;
  return required.filter((k) => CHECKLIST[k] && !CHECKLIST[k].types.some((t) => presentTypes.includes(t))).map((k) => CHECKLIST[k].label);
}

function buildWhere(ctx: ViewContext, f: ApplicationFilters): Prisma.ApplicationWhereInput {
  const and: Prisma.ApplicationWhereInput[] = [];
  if (f.fy) and.push({ fiscalYear: f.fy });
  if (f.status?.length) and.push({ status: { in: f.status } });
  if (f.hospitalId) and.push({ hospitalId: f.hospitalId });
  if (f.diseaseId) and.push({ diseaseId: f.diseaseId });
  if (f.categoryId) and.push({ disease: { categoryId: f.categoryId } });
  // Area is identifying, so it is not a usable filter in Meeting Mode.
  if (f.areaId && !ctx.meetingMode) and.push({ patient: { areaId: f.areaId } });
  if (f.priority) and.push({ priority: f.priority });
  if (f.gender) and.push({ patient: { gender: f.gender } });
  if (f.from) and.push({ applicationDate: { gte: f.from } });
  if (f.to) and.push({ applicationDate: { lt: f.to } });
  if (f.minPaise != null) and.push({ approvedAmountPaise: { gte: f.minPaise } });
  if (f.maxPaise != null) and.push({ approvedAmountPaise: { lte: f.maxPaise } });
  if (f.mine) and.push({ createdById: ctx.userId });
  const q = f.q?.trim();
  if (q) {
    const or: Prisma.ApplicationWhereInput[] = [
      { caseNo: { contains: q, mode: "insensitive" } },
      { patient: { personCode: { equals: q.toUpperCase() } } },
      { applicant: { personCode: { equals: q.toUpperCase() } } },
    ];
    // Name and mobile search is disabled in Meeting Mode.
    if (!ctx.meetingMode) {
      or.push(
        { patient: { fullName: { contains: q, mode: "insensitive" } } },
        { applicant: { fullName: { contains: q, mode: "insensitive" } } },
        { patient: { mobile: { contains: q } } },
        { applicant: { mobile: { contains: q } } },
      );
    }
    and.push({ OR: or });
  }
  return { AND: and };
}

function orderBy(ctx: ViewContext, sort: ApplicationSort): Prisma.ApplicationOrderByWithRelationInput[] {
  const desc = sort.startsWith("-");
  const dir = desc ? "desc" : "asc";
  const nulls = { sort: dir, nulls: "last" } as const;
  const by: Record<string, Prisma.ApplicationOrderByWithRelationInput> = {
    date: { applicationDate: dir },
    approved: { approvedAmountPaise: nulls },
    caseNo: { caseNo: dir },
    // Sorting by name would reveal names through order, so Meeting Mode sorts by person code.
    patient: { patient: ctx.meetingMode ? { personCode: dir } : { fullName: dir } },
    gender: { patient: { gender: nulls } },
    // Exact-age order would give away exact ages behind the bands, so Meeting Mode falls back to person code.
    age: { patient: ctx.meetingMode ? { personCode: dir } : { ageYears: nulls } },
    disease: { disease: { name: dir } },
    hospital: { hospital: { name: dir } },
    status: { status: dir },
  };
  return [by[desc ? sort.slice(1) : sort], { applicationDate: "desc" }, { id: "desc" }];
}

export async function listApplications(ctx: ViewContext, f: ApplicationFilters) {
  const and: Prisma.ApplicationWhereInput[] = [buildWhere(ctx, f)];
  if (f.pendingDocs) and.push({ status: { notIn: ["DRAFT", "CLOSED"] } }, missingDocsWhere(CASE_DOCUMENT_TYPES));
  if (f.repeat) {
    const recent = await prisma.application.groupBy({ by: ["applicantId"], where: { applicationDate: { gte: subMonths(new Date(), 12) } }, having: { applicantId: { _count: { gt: 1 } } } });
    and.push({ applicantId: { in: recent.map((r) => r.applicantId) } });
  }
  const where: Prisma.ApplicationWhereInput = { AND: and };

  const [rows, total, sums, paidSum, people, unpaid] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: orderBy(ctx, f.sort ?? "-date"),
      ...(f.all ? {} : pageArgs(f.page ?? 1)),
      include: { patient: true, disease: { include: { category: true } }, hospital: true },
    }),
    prisma.application.count({ where }),
    prisma.application.aggregate({ where, _sum: { requestedAmountPaise: true, approvedAmountPaise: true } }),
    prisma.payment.aggregate({ where: { ...LIVE_PAYMENT, application: where }, _sum: { amountPaise: true } }),
    prisma.application.groupBy({ by: ["patientId"], where }).then((g) => g.length),
    prisma.application.count({ where: { AND: [where, { status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAYMENT_PENDING"] } }] } }),
  ]);
  const paid = await paidByApplication(rows.map((r) => r.id));
  const out: Page<ApplicationRow> = {
    rows: rows.map((a) => ({
      id: a.id,
      caseNo: a.caseNo,
      applicationDate: a.applicationDate,
      patient: personRef(a.patient, ctx),
      gender: a.patient.gender,
      age: ctx.meetingMode ? toAgeBand(currentAge(a.patient)) : currentAge(a.patient),
      diseaseName: a.disease?.name ?? null,
      categoryName: a.disease?.category.name ?? null,
      hospitalName: a.hospital?.name ?? null,
      requestedPaise: a.requestedAmountPaise,
      approvedPaise: a.approvedAmountPaise,
      paidPaise: paid.get(a.id) ?? 0n,
      status: a.status,
      priority: a.priority,
      watchFlag: a.patient.watchFlag,
    })),
    total,
    page: f.page ?? 1,
    pageSize: PAGE_SIZE,
  };
  return {
    ...out,
    totals: {
      requested: sums._sum.requestedAmountPaise ?? 0n,
      approved: sums._sum.approvedAmountPaise ?? 0n,
      paid: paidSum._sum.amountPaise ?? 0n,
      patients: people,
      notPaidYet: unpaid,
    },
  };
}

/** Cases missing at least one required document, as a WHERE clause the database evaluates. */
export function missingDocsWhere(required: string[]): Prisma.ApplicationWhereInput {
  const checks = required.filter((k) => CHECKLIST[k]).map((k) => ({
    attachments: { none: { deletedAt: null, type: { in: CHECKLIST[k].types as AttachmentType[] } } },
  }));
  return checks.length ? { OR: checks } : { id: { in: [] } };
}

// ─────────────────────────── detail ───────────────────────────

export type PriorAid = { personCode: string; cases: number; totalPaise: bigint; lastAidAt: Date | null; watchFlag: boolean };

export async function priorAid(personId: string, excludeApplicationId?: string): Promise<Omit<PriorAid, "personCode" | "watchFlag">> {
  const where: Prisma.ApplicationWhereInput = {
    OR: [{ applicantId: personId }, { patientId: personId }],
    status: { not: "DRAFT" },
    ...(excludeApplicationId ? { id: { not: excludeApplicationId } } : {}),
  };
  const [cases, pay] = await Promise.all([
    prisma.application.count({ where }),
    prisma.payment.aggregate({ where: { ...LIVE_PAYMENT, application: where }, _sum: { amountPaise: true }, _max: { paymentDate: true } }),
  ]);
  return { cases, totalPaise: pay._sum.amountPaise ?? 0n, lastAidAt: pay._max.paymentDate ?? null };
}

export type ApplicationDetail = Awaited<ReturnType<typeof getApplication>>;

export async function getApplication(ctx: ViewContext, id: string) {
  const a = await prisma.application.findFirst({
    where: { id },
    include: {
      applicant: { include: { area: true } },
      patient: { include: { area: true } },
      hospital: true,
      disease: { include: { category: true } },
      decidedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
      attachments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
      payments: { where: { deletedAt: null }, orderBy: { paymentDate: "asc" }, include: { hospital: true, bank: true, fund: true } },
    },
  });
  if (!a) return null;

  const { masked, grantExpiresAt } = await isMaskedFor(ctx, id);
  const view = { ...ctx, meetingMode: masked };
  const names = [a.applicant.fullName, a.applicant.fatherName, a.applicant.husbandName, a.patient.fullName, a.patient.fatherName, a.patient.husbandName];

  const [applicantPrior, patientPrior, repeatCount, missing, eligibilityVerifier, earmarks] = await Promise.all([
    priorAid(a.applicantId, a.id),
    a.patientId === a.applicantId ? null : priorAid(a.patientId, a.id),
    prisma.application.count({
      where: {
        OR: [{ applicantId: { in: [a.applicantId, a.patientId] } }, { patientId: { in: [a.applicantId, a.patientId] } }],
        applicationDate: { gte: subMonths(a.applicationDate, 12), lte: a.applicationDate },
        status: { not: "DRAFT" },
      },
    }),
    missingDocuments(a.attachments.map((x) => x.type)),
    a.eligibilityVerifiedById ? prisma.user.findUnique({ where: { id: a.eligibilityVerifiedById }, select: { name: true } }) : null,
    prisma.donation.findMany({
      where: { earmarkApplicationId: a.id, cancelledAt: null },
      include: { donor: true },
    }),
  ]);

  const reversed = new Set(a.payments.map((p) => p.reversalOfId).filter(Boolean));
  const paidPaise = a.payments.filter((p) => p.status !== "CANCELLED" && p.status !== "BOUNCED").reduce((s, p) => s + p.amountPaise, 0n);

  return {
    id: a.id,
    caseNo: a.caseNo,
    fiscalYear: a.fiscalYear,
    applicationDate: a.applicationDate,
    status: a.status,
    priority: a.priority,
    masked,
    grantExpiresAt,
    canReveal: ctx.meetingMode && masked && can(ctx, "identity.reveal"),
    applicant: redactPerson(a.applicant, view) as PersonView,
    patient: redactPerson(a.patient, view) as PersonView,
    patientIsApplicant: a.patientIsApplicant,
    relation: a.relation,
    dependentCount: a.dependentCount,
    // Block C. Name-bearing free text is absent (not null) when masked.
    ...(masked ? {} : { introducedByName: a.introducedByName, introducedByPhone: a.introducedByPhone, attendingDoctor: a.attendingDoctor }),
    hospital: a.hospital ? { id: a.hospital.id, name: a.hospital.name, type: a.hospital.type, city: a.hospital.city } : null,
    disease: a.disease ? { id: a.disease.id, name: a.disease.name, categoryName: a.disease.category.name, isChronic: a.disease.isChronic } : null,
    majorProblem: masked ? scrubNames(a.majorProblem, names) : a.majorProblem,
    approxExpensePaise: a.approxExpensePaise,
    requestedAmountPaise: a.requestedAmountPaise,
    admissionDate: a.admissionDate,
    dischargeDate: a.dischargeDate,
    // Eligibility
    eligibility: {
      zakatCategory: a.zakatCategory,
      monthlyIncomePaise: a.monthlyIncomePaise,
      dependentsSupported: a.dependentsSupported,
      ownsHouse: a.ownsHouse,
      ownsAgriLand: a.ownsAgriLand,
      savingsOrGoldNote: masked ? scrubNames(a.savingsOrGoldNote, names) : a.savingsOrGoldNote,
      existingDebtPaise: a.existingDebtPaise,
      ...(masked ? {} : { eligibilityNote: a.eligibilityNote }),
      verifiedAt: a.eligibilityVerifiedAt,
      verifiedByName: eligibilityVerifier?.name ?? null,
      authorisationReceived: a.authorisationReceived,
      complete: a.zakatCategory != null && a.monthlyIncomePaise != null,
    },
    // Decision
    approvedAmountPaise: a.approvedAmountPaise,
    decisionNote: masked ? scrubNames(a.decisionNote, names) : a.decisionNote,
    rejectionReason: masked ? scrubNames(a.rejectionReason, names) : a.rejectionReason,
    decidedByName: a.decidedBy?.name ?? null,
    decidedAt: a.decidedAt,
    createdByName: a.createdBy.name,
    paidPaise,
    // Roles without payments.read get no payment rows; roles that only see amounts get no payee details.
    payments: (can(ctx, "payments.read") ? a.payments : []).map((p) => ({ ...paymentView(p, masked || !can(ctx, "payments.write")), reversed: reversed.has(p.id) })) as (PaymentView & { reversed: boolean })[],
    attachments: a.attachments.map((x) => attachmentView(x, ctx, masked)) as AttachmentView[],
    presentTypes: [...new Set(a.attachments.map((x) => x.type))],
    missingDocuments: missing,
    applicantPrior: { ...applicantPrior, personCode: a.applicant.personCode, watchFlag: a.applicant.watchFlag } as PriorAid,
    patientPrior: patientPrior ? ({ ...patientPrior, personCode: a.patient.personCode, watchFlag: a.patient.watchFlag } as PriorAid) : null,
    repeatCount,
    watch: [a.applicant, a.patient]
      .filter((p, i, arr) => p.watchFlag && arr.findIndex((x) => x.id === p.id) === i)
      .map((p) => ({ personCode: p.personCode, note: masked ? null : p.watchNote })),
    // Donor names on earmarked donations are hidden in Meeting Mode and from roles without donations.read.
    earmarks: earmarks.map((d) => ({
      receiptNo: d.receiptNo,
      amountPaise: d.amountPaise,
      donorName: masked || !can(ctx, "donations.read") ? "Donor" : d.donor.isAnonymous && !can(ctx, "donors.seeAnonymous") ? "Anonymous donor" : d.donor.name,
    })),
    bounced: a.payments.some((p) => p.status === "BOUNCED"),
  };
}

/** Status history + audit entries for the History tab. */
export async function getApplicationHistory(ctx: ViewContext, id: string, masked: boolean) {
  const [history, payments, attachments] = await Promise.all([
    prisma.applicationStatusHistory.findMany({ where: { applicationId: id }, orderBy: { changedAt: "asc" } }),
    prisma.payment.findMany({ where: { applicationId: id, ...includeDeleted }, select: { id: true } }),
    prisma.attachment.findMany({ where: { applicationId: id, ...includeDeleted }, select: { id: true } }),
  ]);
  const ids = [id, ...payments.map((p) => p.id), ...attachments.map((a) => a.id)];
  const audits = await prisma.auditLog.findMany({
    where: { entityId: { in: ids } },
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { name: true } } },
  });
  const userIds = [...new Set(history.map((h) => h.changedById))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  type Item = { at: Date; kind: "status" | "audit"; action: string; actor: string | null; text: string; reason: string | null; highlight: boolean };
  const items: Item[] = [
    ...history.map<Item>((h) => ({
      at: h.changedAt, kind: "status", action: h.toStatus, actor: users.get(h.changedById) ?? null,
      text: h.toStatus, reason: masked ? null : h.note, highlight: false,
    })),
    ...audits.map<Item>((a) => ({
        at: a.createdAt, kind: "audit", action: a.action, actor: a.actor?.name ?? null,
        // Summaries of other users' actions are hidden in Meeting Mode (docs/03 §3).
        text: masked && a.actorId !== ctx.userId ? "" : a.summary,
        reason: a.action === "REVEAL_IDENTITY" && !ctx.meetingMode ? a.reason : null,
        highlight: a.action === "REVEAL_IDENTITY",
      })),
  ];
  return items.sort((x, y) => x.at.getTime() - y.at.getTime());
}

/** Form defaults for editing. Only ever called when the case is not masked. */
export async function getApplicationForEdit(ctx: ViewContext, id: string) {
  const { masked } = await isMaskedFor(ctx, id);
  if (masked) return { masked: true as const };
  const a = await prisma.application.findFirst({
    where: { id },
    include: { applicant: { include: { area: true } }, patient: { include: { area: true } }, attachments: { where: { deletedAt: null } } },
  });
  if (!a) return null;
  return {
    masked: false as const,
    app: a,
    applicant: redactPerson(a.applicant, { meetingMode: false }) as PersonView,
    patient: redactPerson(a.patient, { meetingMode: false }) as PersonView,
    attachments: a.attachments.map((x) => ({ ...attachmentView(x, ctx, false), originalName: x.originalName })),
  };
}

/** Counts for the dashboard "needs attention" list. */
export async function attentionCounts() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5);
  const required = CASE_DOCUMENT_TYPES;
  const [drafts, toPay, unclearedCheques, missingDocs] = await Promise.all([
    prisma.application.count({ where: { status: "DRAFT" } }),
    prisma.application.count({ where: { status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAYMENT_PENDING"] } } }),
    prisma.payment.count({ where: { status: "ISSUED", clearedAt: null, paymentDate: { lt: thirtyDaysAgo }, deletedAt: null } }),
    prisma.application.count({ where: { AND: [{ status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAYMENT_PENDING", "PAID"] } }, missingDocsWhere(required)] } }),
  ]);
  return { drafts, toPay, unclearedCheques, missingDocs };
}

/**
 * Names used before on the form's free-text case fields, for the add-or-pick dropdowns.
 * Only served to the application form, which is not available in Meeting Mode.
 */
export async function caseSuggestions() {
  const [intro, docs] = await Promise.all([
    prisma.application.findMany({ where: { introducedByName: { not: null } }, distinct: ["introducedByName"], select: { introducedByName: true }, orderBy: { introducedByName: "asc" } }),
    prisma.application.findMany({ where: { attendingDoctor: { not: null } }, distinct: ["attendingDoctor"], select: { attendingDoctor: true }, orderBy: { attendingDoctor: "asc" } }),
  ]);
  return {
    introducers: intro.map((r) => r.introducedByName!).filter((v) => v.trim()),
    doctors: docs.map((r) => r.attendingDoctor!).filter((v) => v.trim()),
  };
}
