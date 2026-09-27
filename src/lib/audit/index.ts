import "server-only";
import { headers } from "next/headers";
import type { AuditAction, Prisma } from "@prisma/client";
import type { DB, Tx } from "@/lib/db";

export type AuditEntry = {
  actorId: string | null;
  action: AuditAction;
  entity: string;
  entityId: string;
  /** Human sentence. Never PII — use case numbers and person codes. */
  summary: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

/** BigInt → string, Date → ISO, so snapshots are valid JSON. */
export function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
}

/** Only the keys whose values changed, for compact before/after diffs. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(toJson(before[k])) !== JSON.stringify(toJson(after[k]))) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
}

async function requestMeta() {
  try {
    const h = await headers();
    return {
      ipAddress: h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? null,
      userAgent: h.get("user-agent"),
    };
  } catch {
    return { ipAddress: null, userAgent: null }; // outside a request (seed, tests)
  }
}

export async function audit(db: DB | Tx, e: AuditEntry) {
  const meta = await requestMeta();
  await db.auditLog.create({
    data: {
      actorId: e.actorId,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      summary: e.summary,
      before: toJson(e.before),
      after: toJson(e.after),
      reason: e.reason,
      ...meta,
    },
  });
}
