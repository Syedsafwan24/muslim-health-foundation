import type { ApplicationStatus } from "@prisma/client";
import { fromDateInput, isFiscalYear } from "@/lib/fy";
import { parseRupees } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/applications/transitions";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Typed readers for URL filters. Invalid values are ignored, never trusted. */
export async function readParams(sp: SearchParams) {
  const p = await sp;
  const str = (k: string) => {
    const v = p[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.length <= 200 ? s : undefined;
  };
  const date = (k: string) => {
    const s = str(k);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? fromDateInput(s) : undefined;
  };
  return {
    str,
    date,
    /** Inclusive end date → exclusive upper bound. */
    dateEnd: (k: string) => {
      const d = date(k);
      return d ? new Date(d.getTime() + 864e5) : undefined;
    },
    page: () => Math.max(1, Math.min(10_000, Number(str("page")) || 1)),
    flag: (k: string) => str(k) === "1",
    fy: (k = "fy") => {
      const s = str(k);
      return isFiscalYear(s) ? s : undefined;
    },
    money: (k: string) => {
      const s = str(k);
      return s ? parseRupees(s) ?? undefined : undefined;
    },
    oneOf: <T extends string>(k: string, allowed: readonly T[]) => {
      const s = str(k);
      return allowed.includes(s as T) ? (s as T) : undefined;
    },
    statuses: (k = "status") => (str(k) ?? "").split(",").filter((s): s is ApplicationStatus => s in STATUS_LABEL),
  };
}
