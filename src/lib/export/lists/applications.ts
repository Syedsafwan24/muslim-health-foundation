import "server-only";
import { fmtDate } from "@/lib/fy";
import { GENDER } from "@/lib/labels";
import { STATUS_LABEL } from "@/lib/applications/transitions";
import { readParams } from "@/lib/params";
import { listApplications } from "@/lib/db/queries/applications";
import { applicationFilters } from "@/lib/filters/applications";
import type { ListExport } from "../lists";

export const applicationsExport: ListExport = {
  cap: "applications.read",
  run: async (ctx, sp) => {
    const p = await readParams(Promise.resolve(Object.fromEntries(sp)));
    const f = applicationFilters(p, ctx);
    const d = await listApplications(ctx, { ...f, all: true });
    return {
      title: "Applications",
      subtitle: `${f.fy ? `FY ${f.fy}` : "All years"} · ${d.total} cases`,
      redacted: ctx.meetingMode,
      tables: [{
        title: "Cases",
        columns: [
          { key: "caseNo", label: "Case no" }, { key: "date", label: "Date" }, { key: "patient", label: "Patient" }, { key: "gender", label: "Gender" },
          { key: "age", label: "Age", align: "right" }, { key: "disease", label: "Major problem" }, { key: "hospital", label: "Hospital" },
          { key: "approved", label: "Approved", align: "right", money: true }, { key: "paid", label: "Paid", align: "right", money: true }, { key: "status", label: "Status" },
        ],
        rows: d.rows.map((a) => ({
          caseNo: a.caseNo, date: fmtDate(a.applicationDate), patient: a.patient.displayName, gender: a.gender ? GENDER[a.gender] : null, age: a.age,
          disease: a.diseaseName, hospital: a.hospitalName, approved: a.approvedPaise, paid: a.paidPaise, status: STATUS_LABEL[a.status],
        })),
        totals: { caseNo: "Total", approved: d.totals.approved, paid: d.totals.paid },
      }],
    };
  },
};
