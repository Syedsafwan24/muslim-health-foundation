import "server-only";
import { fmtDate } from "@/lib/fy";
import { GENDER, PAYMENT_MODE, PAYMENT_STATUS } from "@/lib/labels";
import { STATUS_LABEL } from "@/lib/applications/transitions";
import type { ReportTable } from "@/lib/db/queries/reports";
import { getDisease, getHospital } from "@/lib/db/queries/analytics";
import { caseBreakdown, type Breakdown, type Slice } from "@/lib/db/queries/breakdown";
import type { ViewContext } from "@/lib/redact";
import type { ListExport } from "../lists";

const sliceTable = (title: string, data: Slice[]): ReportTable => ({
  title,
  columns: [{ key: "name", label: title.replace(/^By (.)/, (_, c: string) => c.toUpperCase()) }, { key: "cases", label: "Cases", align: "right" }, { key: "patients", label: "Patients", align: "right" }, { key: "paid", label: "Paid", align: "right", money: true }],
  rows: data.map((x) => ({ name: x.name, cases: x.cases, patients: x.patients, paid: x.paidPaise })),
});

function tables(d: Breakdown, slices: { title: string; data: Slice[] }[], show: { disease: boolean; hospital: boolean }): ReportTable[] {
  const s = d.stats;
  return [
    {
      title: "Summary",
      columns: [{ key: "k", label: "" }, { key: "v", label: "", align: "right" }],
      rows: [
        { k: "Total paid", v: s.totalPaise }, { k: "Paid this FY", v: s.fyPaise }, { k: "Cases", v: s.cases }, { k: "Patients", v: s.patients },
        { k: "Approved", v: s.approvedPaise }, { k: "Average per case", v: s.averagePaise }, { k: "Cheques not yet cleared", v: s.pendingCheques },
      ].map((r) => ({ k: r.k, v: typeof r.v === "bigint" ? `₹${(Number(r.v) / 100).toLocaleString("en-IN")}` : r.v })),
    },
    ...slices.filter((x) => x.data.length).map((x) => sliceTable(x.title, x.data)),
    {
      title: "Cases",
      columns: [
        { key: "caseNo", label: "Case no" }, { key: "date", label: "Date" }, { key: "patient", label: "Patient" }, { key: "gender", label: "Gender" }, { key: "age", label: "Age", align: "right" },
        ...(show.disease ? [{ key: "disease", label: "Major problem" }] : []), ...(show.hospital ? [{ key: "hospital", label: "Hospital" }] : []),
        { key: "approved", label: "Approved", align: "right", money: true }, { key: "paid", label: "Paid", align: "right", money: true }, { key: "status", label: "Status" },
      ],
      rows: d.cases.map((c) => ({
        caseNo: c.caseNo, date: fmtDate(c.applicationDate), patient: c.patient.displayName, gender: c.gender ? GENDER[c.gender] : null, age: c.age,
        disease: c.diseaseName, hospital: c.hospitalName, approved: c.approvedPaise, paid: c.paidPaise, status: STATUS_LABEL[c.status],
      })),
    },
    {
      title: "Payments",
      columns: [
        { key: "voucher", label: "Voucher" }, { key: "date", label: "Date" }, { key: "caseNo", label: "Case" }, { key: "mode", label: "Mode" }, { key: "ref", label: "Cheque / ref" },
        { key: "fund", label: "Fund" }, { key: "amount", label: "Amount", align: "right", money: true }, { key: "status", label: "Status" },
      ],
      rows: d.payments.map((p) => ({
        voucher: p.voucherNo, date: fmtDate(p.paymentDate), caseNo: p.caseNo, mode: PAYMENT_MODE[p.mode], ref: p.chequeNo, fund: p.fundName, amount: p.amountPaise, status: PAYMENT_STATUS[p.status],
      })),
    },
  ];
}

export const hospitalExport: ListExport = {
  cap: "applications.read",
  run: async (ctx: ViewContext, sp: URLSearchParams) => {
    const id = sp.get("id") ?? "";
    const [h, d] = await Promise.all([getHospital(id), caseBreakdown(ctx, { hospitalId: id })]);
    if (!h) return null;
    return {
      title: `Hospital report · ${h.name}`,
      subtitle: `As on ${fmtDate(new Date())}`,
      redacted: ctx.meetingMode,
      tables: tables(d, [
        { title: "By disease", data: d.byDisease }, { title: "By category", data: d.byCategory }, { title: "By gender", data: d.byGender },
        { title: "By age", data: d.byAge }, { title: "By city", data: d.byCity },
      ], { disease: true, hospital: false }),
    };
  },
};

export const diseaseExport: ListExport = {
  cap: "applications.read",
  run: async (ctx: ViewContext, sp: URLSearchParams) => {
    const id = sp.get("id") ?? "";
    const [dis, d] = await Promise.all([getDisease(id), caseBreakdown(ctx, { diseaseId: id })]);
    if (!dis) return null;
    return {
      title: `Disease report · ${dis.name}`,
      subtitle: `${dis.categoryName} · as on ${fmtDate(new Date())}`,
      redacted: ctx.meetingMode,
      tables: tables(d, [
        { title: "By hospital", data: d.byHospital }, { title: "By gender", data: d.byGender }, { title: "By age", data: d.byAge }, { title: "By city", data: d.byCity },
      ], { disease: false, hospital: true }),
    };
  },
};
