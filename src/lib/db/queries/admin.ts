import "server-only";
import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { personRef, type ViewContext } from "@/lib/redact";
import { pageArgs } from "./shared";

// Audit log, masters, users and ⌘K search.

// ─────────────────────────── audit ───────────────────────────

export async function listAudit(ctx: ViewContext, f: { action?: AuditAction; actorId?: string; entity?: string; q?: string; from?: Date; to?: Date; page?: number }) {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (f.action) and.push({ action: f.action });
  if (f.actorId) and.push({ actorId: f.actorId });
  if (f.entity) and.push({ entity: f.entity });
  if (f.from) and.push({ createdAt: { gte: f.from } });
  if (f.to) and.push({ createdAt: { lt: f.to } });
  if (f.q?.trim()) and.push({ summary: { contains: f.q.trim(), mode: "insensitive" } });
  const where = { AND: and };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(f.page ?? 1, 50), include: { actor: { select: { name: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id, createdAt: r.createdAt, action: r.action, entity: r.entity, entityId: r.entityId,
      actor: r.actor?.name ?? "System",
      summary: ctx.meetingMode && r.actorId !== ctx.userId ? null : r.summary,
      reason: ctx.meetingMode ? null : r.reason,
      ipAddress: r.ipAddress,
    })),
    total, page: f.page ?? 1, pageSize: 50,
  };
}

// ─────────────────────────── masters ───────────────────────────

export async function masterOptions() {
  const [hospitals, categories, areas, banks, users] = await Promise.all([
    prisma.hospital.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, city: true } }),
    prisma.diseaseCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { diseases: { where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } } } }),
    prisma.area.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.bank.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, branch: true, isOwnAccount: true } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    hospitals: hospitals.map((h) => ({ id: h.id, label: h.city ? `${h.name}, ${h.city}` : h.name })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, diseases: c.diseases })),
    areas,
    banks: banks.map((b) => ({ id: b.id, label: b.branch ? `${b.name}, ${b.branch}` : b.name, isOwnAccount: b.isOwnAccount })),
    users,
  };
}

/** Settings → Masters: every master with its usage count. */
export async function mastersWithUsage() {
  const [areas, banks, categories, diseases, hospitals] = await Promise.all([
    prisma.area.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { persons: true } } } }),
    prisma.bank.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { payments: true, donations: true } } } }),
    prisma.diseaseCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { diseases: true } } } }),
    prisma.disease.findMany({ orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }], include: { category: true, _count: { select: { applications: true } } } }),
    prisma.hospital.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { applications: true, payments: true } } } }),
  ]);
  return {
    areas: areas.map((a) => ({ id: a.id, name: a.name, taluk: a.taluk, uses: a._count.persons })),
    banks: banks.map((b) => ({ id: b.id, name: b.name, branch: b.branch, accountLast4: b.accountLast4, isOwnAccount: b.isOwnAccount, uses: b._count.payments + b._count.donations })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder, uses: c._count.diseases })),
    diseases: diseases.map((d) => ({ id: d.id, name: d.name, categoryId: d.categoryId, categoryName: d.category.name, isChronic: d.isChronic, uses: d._count.applications })),
    hospitals: hospitals.map((h) => ({ id: h.id, name: h.name, city: h.city, isActive: h.isActive, uses: h._count.applications + h._count.payments })),
  };
}

export async function getHospitalForEdit(id: string) {
  return prisma.hospital.findFirst({ where: { id } });
}

// ─────────────────────────── users & settings ───────────────────────────

export async function listUsers(ctx: ViewContext) {
  if (!can(ctx, "users.manage") && !can(ctx, "settings.read")) return [];
  const rows = await prisma.user.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  return rows.map((u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, lastLoginAt: u.lastLoginAt,
    forceMeetingMode: u.forceMeetingMode, locked: !!u.lockedUntil && u.lockedUntil > new Date(),
  }));
}

export async function privacySettings(ctx: Pick<ViewContext, "meetingMode">) {
  const [s, lastToggle, reveals] = await Promise.all([
    getSettings(["meetingMode.global", "reveal.minutes"]),
    prisma.auditLog.findFirst({ where: { action: "MEETING_MODE_TOGGLE" }, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } }),
    prisma.auditLog.findMany({ where: { action: "REVEAL_IDENTITY" }, orderBy: { createdAt: "desc" }, take: 10, include: { actor: { select: { name: true } } } }),
  ]);
  return {
    global: s["meetingMode.global"],
    revealMinutes: s["reveal.minutes"],
    lastToggle: lastToggle ? { at: lastToggle.createdAt, by: lastToggle.actor?.name ?? "System", summary: lastToggle.summary } : null,
    reveals: reveals.map((r) => ({ id: r.id, at: r.createdAt, by: r.actor?.name ?? "", summary: r.summary, reason: ctx.meetingMode ? null : r.reason })),
  };
}

// ─────────────────────────── search (⌘K) ───────────────────────────

export async function globalSearch(ctx: ViewContext, q: string) {
  const term = q.trim();
  if (term.length < 2) return { cases: [], people: [], hospitals: [], donors: [], payments: [], donations: [], namesDisabled: ctx.meetingMode };
  const up = term.toUpperCase();
  const [cases, people, hospitals, donors, payments, donations] = await Promise.all([
    prisma.application.findMany({ where: { caseNo: { contains: up } }, take: 6, select: { id: true, caseNo: true, status: true } }),
    prisma.person.findMany({
      where: { OR: [{ personCode: { contains: up } }, ...(ctx.meetingMode ? [] : [{ fullName: { contains: term, mode: "insensitive" as const } }, { mobile: { contains: term } }])] },
      take: 6,
      select: { id: true, personCode: true, fullName: true },
    }),
    prisma.hospital.findMany({ where: { name: { contains: term, mode: "insensitive" } }, take: 5, select: { id: true, name: true, city: true } }),
    can(ctx, "donations.read")
      ? prisma.donor.findMany({
          where: { OR: [{ donorCode: { contains: up } }, { name: { contains: term, mode: "insensitive" }, ...(can(ctx, "donors.seeAnonymous") ? {} : { isAnonymous: false }) }] },
          take: 5,
          select: { id: true, donorCode: true, name: true, isAnonymous: true },
        })
      : [],
    can(ctx, "payments.read")
      ? prisma.payment.findMany({ where: { OR: [{ voucherNo: { contains: up } }, { chequeNo: { contains: term } }] }, take: 5, select: { id: true, voucherNo: true, chequeNo: true } })
      : [],
    can(ctx, "donations.read") ? prisma.donation.findMany({ where: { receiptNo: { contains: up } }, take: 5, select: { id: true, receiptNo: true } }) : [],
  ]);
  return {
    cases,
    people: people.map((p) => personRef(p, ctx)),
    hospitals,
    donors: donors.map((d) => ({ id: d.id, donorCode: d.donorCode, name: d.isAnonymous && !can(ctx, "donors.seeAnonymous") ? "Anonymous donor" : d.name })),
    payments,
    donations,
    namesDisabled: ctx.meetingMode,
  };
}

// ─────────────────────────── shell: badges and notifications ───────────────────────────

/** Derived notifications (no table): what needs this user's attention. */
export async function shellCounts(ctx: ViewContext) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5);
  const [drafts, toPay, uncleared] = await Promise.all([
    prisma.application.count({ where: { status: "DRAFT", ...(can(ctx, "applications.decide") ? {} : { createdById: ctx.userId }) } }),
    prisma.application.count({ where: { status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAYMENT_PENDING"] } } }),
    prisma.payment.count({ where: { status: "ISSUED", clearedAt: null, paymentDate: { lt: thirtyDaysAgo } } }),
  ]);
  const notices: { label: string; count: number; href: string }[] = [];
  if (can(ctx, "applications.write")) notices.push({ label: "Unfinished entries (drafts)", count: drafts, href: "/applications?status=DRAFT" });
  if (can(ctx, "payments.write")) {
    notices.push({ label: "Approved cases waiting for payment", count: toPay, href: "/applications?status=APPROVED,PARTIALLY_APPROVED,PAYMENT_PENDING" });
    notices.push({ label: "Cheques not cleared after 30 days", count: uncleared, href: "/payments?uncleared30=1" });
  }
  const applicationsBadge = can(ctx, "payments.write") ? toPay : can(ctx, "applications.write") ? drafts : 0;
  return { notices, applicationsBadge, paymentsBadge: can(ctx, "payments.read") ? uncleared : 0 };
}

/** Settings → Numbering: the next number of each series (read-only preview). */
export async function numberingPreview(fy: string) {
  const ids = [`case:${fy}`, `voucher:${fy}`, `receipt:${fy}`, `expense:${fy}`, "person", "donor"];
  const rows = await prisma.counter.findMany({ where: { id: { in: ids } } });
  const next = (id: string) => (rows.find((r) => r.id === id)?.value ?? 0) + 1;
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return [
    { series: "Case number", format: "MHF/{FY}/{5 digits}", next: `MHF/${fy}/${pad(next(`case:${fy}`), 5)}`, perFy: true },
    { series: "Payment voucher", format: "V/{FY}/{5 digits}", next: `V/${fy}/${pad(next(`voucher:${fy}`), 5)}`, perFy: true },
    { series: "Donation receipt", format: "R/{FY}/{5 digits}", next: `R/${fy}/${pad(next(`receipt:${fy}`), 5)}`, perFy: true },
    { series: "Expense voucher", format: "E/{FY}/{5 digits}", next: `E/${fy}/${pad(next(`expense:${fy}`), 5)}`, perFy: true },
    { series: "Person code", format: "P-{6 digits}", next: `P-${pad(next("person"), 6)}`, perFy: false },
    { series: "Donor code", format: "D-{5 digits}", next: `D-${pad(next("donor"), 5)}`, perFy: false },
  ];
}

export async function lastBackup() {
  const row = await prisma.setting.findUnique({ where: { key: "backup.lastRunAt" } });
  return typeof row?.value === "string" ? new Date(row.value) : null;
}
