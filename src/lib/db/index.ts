import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";

// Models without a deletedAt column are never soft-deleted.
const NO_SOFT_DELETE = new Set(["AuditLog", "ApplicationStatusHistory", "Setting", "Counter", "RevealGrant"]);
const READS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
]);

function createClient() {
  return new PrismaClient().$extends({
    name: "soft-delete",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (NO_SOFT_DELETE.has(model) || !READS.has(operation)) return query(args);
          const a = (args ?? {}) as { where?: Record<string, unknown> };
          // An explicit deletedAt filter (e.g. the restore screen) wins.
          if (!a.where || !("deletedAt" in a.where)) a.where = { ...a.where, deletedAt: null };
          return query(a as typeof args);
        },
      },
    },
  });
}

export type DB = ReturnType<typeof createClient>;
export type Tx = Parameters<Parameters<DB["$transaction"]>[0]>[0];

const g = globalThis as unknown as { __prisma?: DB };
export const prisma: DB = g.__prisma ?? createClient();
if (process.env.NODE_ENV !== "production") g.__prisma = prisma;

/** FY-scoped serials. Row-locked upsert — never count()+1. */
export async function nextCounter(tx: Tx, id: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" (id, value) VALUES (${id}, 1)
    ON CONFLICT (id) DO UPDATE SET value = "Counter".value + 1
    RETURNING value`;
  return rows[0].value;
}

export { Prisma };

/** Spread into a where clause to include soft-deleted rows (history, restore screens). */
export const includeDeleted = { deletedAt: undefined } as const;
