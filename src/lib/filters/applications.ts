import type { Gender } from "@prisma/client";
import { AMOUNT_BANDS, GENDER, type AmountBand } from "@/lib/labels";
import type { readParams } from "@/lib/params";
import type { ViewContext } from "@/lib/redact";
import { APPLICATION_SORTS, type ApplicationFilters } from "@/lib/db/queries/applications";

/** The Applications list's URL filters, shared by the page and its export so both show the same rows. */
export function applicationFilters(p: Awaited<ReturnType<typeof readParams>>, ctx: Pick<ViewContext, "fy">): ApplicationFilters {
  const statuses = p.statuses();
  const band = p.oneOf("amount", Object.keys(AMOUNT_BANDS) as AmountBand[]);
  return {
    q: p.str("q"),
    status: statuses.length ? statuses : undefined,
    fy: p.fy() ?? (p.str("fy") === "all" ? undefined : ctx.fy),
    hospitalId: p.str("hospital"),
    diseaseId: p.str("disease"),
    categoryId: p.str("category"),
    gender: p.oneOf("gender", Object.keys(GENDER) as Gender[]),
    from: p.date("from"),
    to: p.dateEnd("to"),
    minPaise: band ? AMOUNT_BANDS[band].min ?? undefined : undefined,
    // Bands are [min, max); the query's max is inclusive, so step back one paisa.
    maxPaise: band && AMOUNT_BANDS[band].max != null ? AMOUNT_BANDS[band].max! - 1n : undefined,
    sort: p.oneOf("sort", APPLICATION_SORTS),
    page: p.page(),
  };
}
