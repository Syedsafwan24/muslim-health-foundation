import "server-only";
import { cache } from "react";
import { prisma, type Tx } from "@/lib/db";
import { fyRange as indianRange, getFiscalYear } from "@/lib/fy";

// Fiscal years are rows the super admin creates with their own start and end dates
// (Settings → Fiscal years). Everything that turns a date into a year, or a year into dates,
// goes through here. `endsOn` is exclusive: the day after the last day.

type Row = { code: string; startsOn: Date; endsOn: Date; status: "OPEN" | "CLOSED" };
type Db = typeof prisma | Tx;

const loadAll = cache(async (): Promise<Row[]> =>
  prisma.fiscalYear.findMany({ orderBy: { startsOn: "desc" }, select: { code: true, startsOn: true, endsOn: true, status: true } }));
/** Inside a transaction read fresh rows; elsewhere once per request. */
const rows = (db?: Db) =>
  db ? db.fiscalYear.findMany({ orderBy: { startsOn: "desc" }, select: { code: true, startsOn: true, endsOn: true, status: true } }) : loadAll();

/** [start, end) of a year. A code with no row (e.g. an old link) gets an empty range. */
export async function fyBounds(code: string, db?: Db): Promise<{ start: Date; end: Date }> {
  const row = (await rows(db)).find((r) => r.code === code);
  if (row) return { start: row.startsOn, end: row.endsOn };
  return { start: new Date(0), end: new Date(0) };
}

/** The year whose dates contain `date`, or null when no year covers it. */
export async function fyOfDate(date: Date, db?: Db): Promise<string | null> {
  return (await rows(db)).find((r) => r.startsOn <= date && date < r.endsOn)?.code ?? null;
}

/** The year that ended before this one started, for "vs last year" comparisons. */
export async function previousFy(code: string, db?: Db): Promise<string | null> {
  const all = await rows(db);
  const me = all.find((r) => r.code === code);
  return me ? (all.find((r) => r.startsOn < me.startsOn)?.code ?? null) : null;
}

/** Year name from its dates: "2026-27" when it crosses a calendar year, else "2027". */
export function fyCodeFor(start: Date, lastDay: Date): string {
  const y1 = Number(start.toLocaleString("en-CA", { timeZone: "Asia/Kolkata", year: "numeric" }));
  const y2 = Number(lastDay.toLocaleString("en-CA", { timeZone: "Asia/Kolkata", year: "numeric" }));
  return y1 === y2 ? String(y1) : `${y1}-${String(y2 % 100).padStart(2, "0")}`;
}

/** Suggested dates for a new year: the day after the last one ends, for twelve months. */
export async function suggestNextYear(db?: Db): Promise<{ start: Date; end: Date }> {
  const latest = (await rows(db))[0];
  if (!latest) return indianRange(getFiscalYear());
  const start = latest.endsOn;
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  return { start, end };
}

