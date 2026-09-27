import "server-only";
import type { HospitalType } from "@prisma/client";
import { HOSPITAL_TYPE } from "@/lib/labels";
import { readParams } from "@/lib/params";
import { diseaseRows, listHospitals } from "@/lib/db/queries/analytics";
import type { ListExport } from "../lists";

const params = (sp: URLSearchParams) => readParams(Promise.resolve(Object.fromEntries(sp)));

export const hospitalsExport: ListExport = {
  cap: "applications.read",
  run: async (ctx, sp) => {
    const p = await params(sp);
    const rows = await listHospitals(ctx, {
      q: p.str("q"), includeInactive: p.flag("inactive"), type: p.oneOf("type", Object.keys(HOSPITAL_TYPE) as HospitalType[]), withCases: p.flag("withCases"),
    });
    return {
      title: "Hospitals",
      subtitle: `FY ${ctx.fy}`,
      redacted: true,
      tables: [{
        title: "Hospitals",
        columns: [
          { key: "name", label: "Hospital" }, { key: "type", label: "Type" }, { key: "city", label: "City" }, { key: "cases", label: "Cases (FY)", align: "right" },
          { key: "patients", label: "Patients (FY)", align: "right" }, { key: "paid", label: "Total paid (FY)", align: "right", money: true }, { key: "pending", label: "Pending cheques", align: "right" },
        ],
        rows: rows.map((h) => ({ name: h.name, type: HOSPITAL_TYPE[h.type], city: h.city, cases: h.cases, patients: h.patients, paid: h.paidPaise, pending: h.pendingCheques })),
        totals: { name: "Total", cases: rows.reduce((s, h) => s + h.cases, 0), paid: rows.reduce((s, h) => s + h.paidPaise, 0n) },
      }],
    };
  },
};

export const diseasesExport: ListExport = {
  cap: "applications.read",
  run: async (ctx, sp) => {
    const p = await params(sp);
    const { rows, totals } = await diseaseRows(ctx, { q: p.str("q"), categoryId: p.str("category"), chronic: p.flag("chronic"), withCases: p.flag("withCases") });
    return {
      title: "Diseases",
      subtitle: `FY ${ctx.fy}`,
      redacted: true,
      tables: [{
        title: "Diseases",
        columns: [
          { key: "name", label: "Disease" }, { key: "category", label: "Category" }, { key: "patients", label: "Patients (FY)", align: "right" },
          { key: "cases", label: "Cases (FY)", align: "right" }, { key: "paid", label: "Total paid (FY)", align: "right", money: true }, { key: "average", label: "Average per case", align: "right", money: true },
        ],
        rows: rows.map((d) => ({ name: d.name, category: d.categoryName, patients: d.patients, cases: d.cases, paid: d.totalPaise, average: d.averagePaise })),
        totals: { name: "Total", patients: totals.patients, cases: totals.cases, paid: totals.paidPaise },
      }],
    };
  },
};
