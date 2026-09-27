import "server-only";
import { fmtDate } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import { GENDER } from "@/lib/labels";
import { readParams } from "@/lib/params";
import { listPeople, peopleFilters } from "@/lib/db/queries/people";
import type { ReportColumn } from "@/lib/db/queries/reports";
import type { ViewContext } from "@/lib/redact";
import type { ListExport } from "../lists";

/** Same redacted query and filters as /patients and /applicants, every row instead of one page. */
const peopleExport = (as: "patient" | "applicant"): ListExport => ({
  cap: "people.read",
  run: async (ctx: ViewContext, sp: URLSearchParams) => {
    const p = await readParams(Promise.resolve(Object.fromEntries(sp)));
    const { rows, stats: s } = await listPeople(ctx, { as, ...peopleFilters(p), all: true });
    const mm = ctx.meetingMode;
    const title = as === "patient" ? "Patients" : "Applicants";
    const columns: ReportColumn[] = [
      { key: "code", label: "Person code" },
      ...(mm ? [] : [{ key: "name", label: "Name" }]),
      { key: "gender", label: "Gender" },
      { key: "age", label: mm ? "Age band" : "Age", align: "right" as const },
      ...(mm ? [] : [{ key: "area", label: "Area" }, { key: "mobile", label: "Mobile no." }]),
      { key: "cases", label: "Cases", align: "right" as const },
      { key: "paid", label: "Aid received", align: "right" as const, money: true },
      { key: "last", label: "Last case" },
    ];
    return {
      title,
      subtitle: `As on ${fmtDate(new Date())}`,
      redacted: mm,
      tables: [
        {
          title: "Summary",
          columns: [{ key: "k", label: "" }, { key: "v", label: "", align: "right" }],
          rows: [
            { k: title, v: s.people }, { k: "Cases", v: s.cases }, { k: "Aid received", v: formatINR(s.paidPaise) },
            as === "patient" ? { k: "Male · Female", v: `${s.male} · ${s.female}` } : { k: "Repeat applicants", v: s.repeat },
          ],
        },
        {
          title,
          columns,
          rows: rows.map((r) => ({
            code: r.person.personCode, name: r.person.displayName, gender: r.gender ? GENDER[r.gender as keyof typeof GENDER] : null,
            age: mm ? r.ageBand : r.age ?? null, area: r.areaName ?? null, mobile: r.mobile ?? null,
            cases: r.cases, paid: r.totalPaise, last: r.lastCaseAt ? fmtDate(r.lastCaseAt) : null,
          })),
        },
      ],
    };
  },
});

export const patientsExport = peopleExport("patient");
export const applicantsExport = peopleExport("applicant");
