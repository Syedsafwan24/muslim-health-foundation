import "server-only";
import type { AttachmentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { FINANCIAL_ATTACHMENTS } from "@/lib/labels";
import type { ViewContext } from "@/lib/redact";

export const PAGE_SIZE = 25;

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };

export const pageArgs = (page: number, pageSize = PAGE_SIZE) => ({
  skip: (Math.max(1, page) - 1) * pageSize,
  take: pageSize,
});

/**
 * Payments that count as money out. A cleared payment is never edited; cancelling it adds a
 * negative counter-entry (reversalOfId) that is itself live, so the two net to zero.
 */
export const LIVE_PAYMENT: Prisma.PaymentWhereInput = { status: { notIn: ["CANCELLED", "BOUNCED"] }, deletedAt: null };

/** Sum of live payments per application id. */
export async function paidByApplication(ids: string[]): Promise<Map<string, bigint>> {
  if (!ids.length) return new Map();
  const rows = await prisma.payment.groupBy({
    by: ["applicationId"],
    where: { ...LIVE_PAYMENT, applicationId: { in: ids } },
    _sum: { amountPaise: true },
  });
  return new Map(rows.map((r) => [r.applicationId, r._sum.amountPaise ?? 0n]));
}

/**
 * Is identity hidden for this particular case? Meeting Mode, unless the super admin holds an
 * unexpired reveal grant for it.
 */
export async function isMaskedFor(ctx: ViewContext, applicationId: string): Promise<{ masked: boolean; grantExpiresAt: Date | null }> {
  if (!ctx.meetingMode) return { masked: false, grantExpiresAt: null };
  if (!can(ctx, "identity.reveal")) return { masked: true, grantExpiresAt: null };
  const grant = await prisma.revealGrant.findFirst({
    where: { userId: ctx.userId, applicationId, expiresAt: { gt: new Date() }, endedAt: null },
    orderBy: { expiresAt: "desc" },
  });
  return { masked: !grant, grantExpiresAt: grant?.expiresAt ?? null };
}

export type AttachmentView = {
  id: string;
  type: AttachmentType;
  pageCount: number | null;
  sizeBytes: number;
  mimeType: string;
  createdAt: Date;
  /** Locked tiles show only type, page count and date. No name, no URL. */
  locked: boolean;
  lockReason: "meeting" | "role" | null;
  label: string | null;
  verified: boolean;
};

export function attachmentView(
  a: { id: string; type: AttachmentType; pageCount: number | null; sizeBytes: number; mimeType: string; createdAt: Date; containsIdentity: boolean; label: string | null; verifiedAt: Date | null },
  ctx: ViewContext,
  masked: boolean,
): AttachmentView {
  const lockReason = attachmentLock(a, ctx, masked);
  return {
    id: a.id, type: a.type, pageCount: a.pageCount, sizeBytes: a.sizeBytes, mimeType: a.mimeType, createdAt: a.createdAt,
    locked: lockReason !== null, lockReason,
    label: lockReason ? null : a.label, // labels are clerk free text
    verified: !!a.verifiedAt,
  };
}

/** Why this user may not open this file right now, or null if they may. Shared with the file route. */
export function attachmentLock(a: { type: AttachmentType; containsIdentity: boolean }, ctx: ViewContext, masked: boolean): "meeting" | "role" | null {
  if (masked && a.containsIdentity) return "meeting";
  if (can(ctx, "attachments.read")) return null;
  if (can(ctx, "attachments.readFinancial") && FINANCIAL_ATTACHMENTS.includes(a.type)) return null;
  return "role";
}

/**
 * Server-only lookup for the file route. Decides access (role + Meeting Mode) and writes the
 * FILE_VIEW / FILE_DOWNLOAD audit row. The storage key never leaves the server.
 */
export async function authorizeFileAccess(ctx: ViewContext, id: string, download: boolean) {
  const a = await prisma.attachment.findFirst({
    where: { id },
    include: { application: { select: { id: true, caseNo: true } } },
  });
  if (!a) return { ok: false as const, status: 404 };
  const masked = a.applicationId ? (await isMaskedFor(ctx, a.applicationId)).masked : ctx.meetingMode;
  if (attachmentLock(a, ctx, masked)) return { ok: false as const, status: 403 };
  await audit(prisma, {
    actorId: ctx.userId,
    action: download ? "FILE_DOWNLOAD" : "FILE_VIEW",
    entity: "Attachment",
    entityId: a.id,
    summary: `${download ? "Downloaded" : "Viewed"} ${a.type.toLowerCase().replace(/_/g, " ")} on case ${a.application?.caseNo ?? "—"}`,
  });
  const ext = a.mimeType === "application/pdf" ? "pdf" : a.mimeType.split("/")[1] ?? "bin";
  return {
    ok: true as const,
    storageKey: a.storageKey,
    mimeType: a.mimeType,
    // A download name without PII: case number + document type.
    downloadName: `${(a.application?.caseNo ?? "document").replace(/\//g, "-")}-${a.type.toLowerCase()}.${ext}`,
  };
}

/** Every export records what was exported, with which filters, how many rows, and whether it was redacted. */
export async function recordExport(ctx: ViewContext, e: { what: string; entityId: string; filters: Record<string, unknown>; rows: number; redacted: boolean }) {
  await audit(prisma, {
    actorId: ctx.userId,
    action: "EXPORT",
    entity: "Export",
    entityId: e.entityId,
    summary: `Exported ${e.what} (${e.rows} rows, ${e.redacted ? "redacted" : "UNREDACTED"})`,
    after: { filters: e.filters, rows: e.rows, redacted: e.redacted },
  });
}
