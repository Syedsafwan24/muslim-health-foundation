import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const TZ = "Asia/Kolkata";

/** Indian fiscal year: 1 April – 31 March. 2026-09-26 → "2026-27". */
export function getFiscalYear(d: Date = new Date()): string {
  const y = Number(formatInTimeZone(d, TZ, "yyyy"));
  const m = Number(formatInTimeZone(d, TZ, "M"));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Half-open UTC range [start, end) for a fiscal year, boundaries at IST midnight. */
export function fyRange(fy: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(fy);
  if (!m) throw new Error(`Bad fiscal year: ${fy}`);
  const y = Number(m[1]);
  return {
    start: fromZonedTime(`${y}-04-01T00:00:00`, TZ),
    end: fromZonedTime(`${y + 1}-04-01T00:00:00`, TZ),
  };
}

export function previousFiscalYear(fy: string): string {
  const y = Number(fy.slice(0, 4)) - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/** The last `n` fiscal years, newest first. */
export function recentFiscalYears(n = 5, from = new Date()): string[] {
  const out = [getFiscalYear(from)];
  while (out.length < n) out.push(previousFiscalYear(out[out.length - 1]));
  return out;
}

export function isFiscalYear(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}$/.test(v);
}

/** Display helpers — always in IST. */
export const fmtDate = (d: Date | null | undefined) => (d ? formatInTimeZone(d, TZ, "dd MMM yyyy") : "—");
export const fmtDateTime = (d: Date | null | undefined) => (d ? formatInTimeZone(d, TZ, "dd MMM yyyy, HH:mm") : "—");
export const fmtMonth = (d: Date) => formatInTimeZone(d, TZ, "MMM yyyy");
/** yyyy-MM-dd in IST, for <input type="date"> values. */
export const toDateInput = (d: Date | null | undefined) => (d ? formatInTimeZone(d, TZ, "yyyy-MM-dd") : "");
/** Parse a yyyy-MM-dd input value as IST midnight. */
export const fromDateInput = (s: string) => fromZonedTime(`${s}T00:00:00`, TZ);
/** Month key (yyyy-MM) in IST, for grouping. */
export const monthKey = (d: Date) => formatInTimeZone(d, TZ, "yyyy-MM");

/** Rows grouped by IST month, formatting each date once (time-zone formatting is slow). */
export function byMonth<T>(rows: T[], date: (r: T) => Date): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = monthKey(date(r));
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}
