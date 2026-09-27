import { NextResponse } from "next/server";
import { requireViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDateTime, fromDateInput, getFiscalYear, isFiscalYear, fyRange } from "@/lib/fy";
import { amountInWords, formatINR } from "@/lib/money";
import {
  GENDER, MARITAL, PAYEE_TYPE, PAYMENT_MODE, PAYMENT_STATUS, RELATION, TOWARDS, AUDIT_ACTION,
} from "@/lib/labels";
import { STATUS_LABEL } from "@/lib/applications/transitions";
import type { PersonView, ViewContext } from "@/lib/redact";
import { getApplication } from "@/lib/db/queries/applications";
import { getPayment } from "@/lib/db/queries/payments";
import { getDonation, getDonor } from "@/lib/db/queries/donations";
import { listAudit } from "@/lib/db/queries/admin";
import { canViewReport, cellText, fyPeriod, REPORTS, runReport, type ReportKey, type ReportTable } from "@/lib/db/queries/reports";
import { recordExport } from "@/lib/db/queries/shared";
import { CaseSheet, Receipt, Tables, toPdf, Voucher, type Org, type Printed } from "@/lib/pdf/documents";
import { toXlsx } from "@/lib/export/xlsx";
import { LIST_EXPORTS } from "@/lib/export/lists";

// All exports: server-generated, permission-checked, redaction-aware and audited.
export const runtime = "nodejs";

const deny = (msg: string, status = 403) => new NextResponse(msg, { status, headers: { "Cache-Control": "no-store" } });
const file = (buf: Buffer, name: string, type: "pdf" | "xlsx", inline = type === "pdf") =>
  new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": type === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\w.-]/g, "-")}"`,
      "Cache-Control": "no-store, private",
    },
  });

async function org(): Promise<Org> {
  const s = await getSettings(["org.name", "org.address", "org.phone", "org.email", "org.registrationNo", "org.80gNo"]);
  return { name: s["org.name"], address: s["org.address"], phone: s["org.phone"], email: s["org.email"], registrationNo: s["org.registrationNo"], eightyGNo: s["org.80gNo"] };
}
const printed = (ctx: ViewContext, reference: string): Printed => ({ reference, by: ctx.name, at: fmtDateTime(new Date()) });

function personRows(p: PersonView): [string, string][] {
  if (p.isRedacted) {
    return [["Person code", p.personCode], ["Gender", p.gender ? GENDER[p.gender] : "—"], ["Age band", p.ageBand ?? "—"], ["Status", MARITAL[p.maritalStatus]], ["Identity", "Hidden — meeting mode"]];
  }
  return [
    ["Name", p.fullName], ["Person code", p.personCode], ["Father name", p.fatherName ?? ""], ["Husband name", p.husbandName ?? ""],
    ["Address", [p.addressLine, p.areaName, p.city, p.pincode].filter(Boolean).join(", ")], ["Status", MARITAL[p.maritalStatus]],
    ["Age", p.age != null ? String(p.age) : ""], ["Gender", p.gender ? GENDER[p.gender] : ""], ["Religion", p.religion ?? ""],
    ["Mobile no.", p.mobile ?? ""],
  ];
}

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  let ctx: ViewContext;
  try {
    ctx = await requireViewContext();
  } catch {
    return deny("Sign in again to export.", 401);
  }
  const { report } = await params;
  const url = new URL(req.url);
  const q = (k: string) => url.searchParams.get(k);
  const id = q("id") ?? "";

  switch (report) {
    case "case-sheet": {
      if (!can(ctx, "applications.read")) return deny("Not available to your role.");
      const a = await getApplication(ctx, id);
      if (!a) return deny("Not found.", 404);
      const m = a.masked;
      const buf = await toPdf(
        <CaseSheet
          org={await org()}
          printed={printed(ctx, a.caseNo)}
          d={{
            caseNo: a.caseNo, status: STATUS_LABEL[a.status], date: fmtDate(a.applicationDate),
            applicant: personRows(a.applicant), applicantRedacted: a.applicant.isRedacted,
            patient: a.patientIsApplicant ? null : [...personRows(a.patient), ["Applicant relation with patient", RELATION[a.relation]], ["Dependent", String(a.dependentCount ?? "")]],
            patientRedacted: a.patient.isRedacted,
            // Block C, in the order of the paper form.
            caseFields: [
              ...(a.patientIsApplicant ? [] : ([["Applicant relation with patient", RELATION[a.relation]]] as [string, string][])),
              ...(m ? [] : ([["Introduce by", a.introducedByName ?? ""], ["Attending Dr.", a.attendingDoctor ?? ""]] as [string, string][])),
              ["Major problem of the patient", a.disease ? `${a.disease.name} (${a.disease.categoryName})` : a.majorProblem ?? ""],
              ["Approx hospital expenses", formatINR(a.approxExpensePaise)],
              ["Name of the hospital", a.hospital ? `${a.hospital.name}${a.hospital.city ? `, ${a.hospital.city}` : ""}` : ""],
              ["Approved (INR)", formatINR(a.approvedAmountPaise)],
            ],
            eligibility: [],
            decision: [],
            payments: a.payments.map((p) => ({
              voucherNo: p.voucherNo, date: fmtDate(p.paymentDate), mode: PAYMENT_MODE[p.mode], cheque: p.chequeNo ?? p.referenceNo ?? "", bank: p.bankName ?? "",
              towards: TOWARDS[p.towards], hospital: p.hospitalName ?? p.payeeName ?? "", amount: formatINR(p.amountPaise), status: PAYMENT_STATUS[p.status],
            })),
          }}
        />,
      );
      await recordExport(ctx, { what: `case sheet ${a.caseNo}`, entityId: a.id, filters: {}, rows: 1, redacted: m });
      return file(buf, `${a.caseNo}-case-sheet.pdf`, "pdf");
    }

    case "voucher": {
      if (!can(ctx, "payments.read")) return deny("Not available to your role.");
      const p = await getPayment(ctx, id);
      if (!p) return deny("Not found.", 404);
      const abs = p.amountPaise < 0n ? -p.amountPaise : p.amountPaise;
      const buf = await toPdf(
        <Voucher
          org={await org()}
          printed={printed(ctx, p.voucherNo)}
          d={{
            voucherNo: p.voucherNo, caseNo: p.caseNo, amount: formatINR(p.amountPaise), words: amountInWords(abs), reversal: p.isReversal,
            fields: [
              ["Cheque", p.chequeNo ?? ""], ["INR", formatINR(p.amountPaise)], ["Bank", p.bankName ?? ""], ["Payment date", fmtDate(p.paymentDate)],
              ["Mode of transfer", PAYMENT_MODE[p.mode]], ["Towards", TOWARDS[p.towards]], ["Name of the hospital", p.hospitalName ?? ""],
              ["Payee", p.payeeType === "HOSPITAL" ? "Hospital" : `${PAYEE_TYPE[p.payeeType] ?? p.payeeType}${p.payeeName ? ` — ${p.payeeName}` : ""}`],
              ["Reference / UTR", p.referenceNo ?? ""], ["Status", PAYMENT_STATUS[p.status]], ["Fund", p.fundName], ["Remark", p.remark ?? ""],
            ],
          }}
        />,
      );
      await recordExport(ctx, { what: `voucher ${p.voucherNo}`, entityId: p.id, filters: {}, rows: 1, redacted: ctx.meetingMode });
      return file(buf, `${p.voucherNo}.pdf`, "pdf");
    }

    case "receipt": {
      if (!can(ctx, "donations.read")) return deny("Not available to your role.");
      const d = await getDonation(ctx, id);
      if (!d) return deny("Not found.", 404);
      const buf = await toPdf(
        <Receipt
          org={await org()}
          printed={printed(ctx, d.receiptNo)}
          d={{
            receiptNo: d.receiptNo, date: fmtDate(d.donationDate), donor: d.donor.name, address: [d.donor.addressLine, d.donor.city].filter(Boolean).join(", "),
            pan: d.donor.panLast4 ?? "", amount: formatINR(d.amountPaise), words: amountInWords(d.amountPaise), fund: d.fundName, mode: PAYMENT_MODE[d.mode],
            reference: d.chequeNo ?? d.referenceNo ?? "", cancelled: !!d.cancelledAt,
          }}
        />,
      );
      await recordExport(ctx, { what: `receipt ${d.receiptNo}`, entityId: d.id, filters: {}, rows: 1, redacted: d.donor.name === "Anonymous donor" });
      return file(buf, `${d.receiptNo}.pdf`, "pdf");
    }

    case "donor-statement": {
      if (!can(ctx, "donations.read")) return deny("Not available to your role.");
      const d = await getDonor(ctx, id);
      if (!d) return deny("Not found.", 404);
      const fy = isFiscalYear(q("fy")) ? q("fy")! : getFiscalYear();
      const { start, end } = fyRange(fy);
      const rows = d.donations.filter((x) => !x.cancelled && x.donationDate >= start && x.donationDate < end);
      const total = rows.reduce((s, x) => s + x.amountPaise, 0n);
      const buf = await toPdf(
        <Tables
          org={await org()}
          printed={printed(ctx, d.donor.donorCode)}
          title="Annual donation statement"
          subtitle={`${d.donor.name} · ${d.donor.donorCode} · FY ${fy}`}
          landscape={false}
          tables={[{
            title: `Donations received from ${d.donor.name}, FY ${fy}`,
            columns: [{ label: "Receipt" }, { label: "Date" }, { label: "Fund" }, { label: "Mode" }, { label: "Amount", align: "right" }],
            rows: rows.map((x) => [x.receiptNo, fmtDate(x.donationDate), x.fundName, PAYMENT_MODE[x.mode], formatINR(x.amountPaise)]),
            totals: ["Total", "", "", "", formatINR(total)],
            note: `${amountInWords(total)}. With thanks from the trustees.`,
          }]}
        />,
      );
      await recordExport(ctx, { what: `donor statement ${d.donor.donorCode} FY ${fy}`, entityId: d.donor.id, filters: { fy }, rows: rows.length, redacted: false });
      return file(buf, `${d.donor.donorCode}-statement-${fy}.pdf`, "pdf");
    }

    case "audit": {
      if (!can(ctx, "audit.export")) return deny("Only the super admin can export the audit log.");
      const r = await listAudit(ctx, { page: 1 });
      const all = [];
      for (let page = 1; page <= Math.ceil(r.total / 50) && page <= 400; page++) all.push(...(await listAudit(ctx, { page })).rows);
      const table: ReportTable = {
        title: "Audit log",
        columns: [{ key: "at", label: "When" }, { key: "actor", label: "Who" }, { key: "action", label: "Action" }, { key: "entity", label: "Entity" }, { key: "summary", label: "Summary" }, { key: "reason", label: "Reason" }, { key: "ip", label: "IP" }],
        rows: all.map((x) => ({ at: fmtDateTime(x.createdAt), actor: x.actor, action: AUDIT_ACTION[x.action], entity: x.entity, summary: x.summary ?? "", reason: x.reason ?? "", ip: x.ipAddress ?? "" })),
      };
      const buf = await toXlsx([table], { org: (await org()).name, printedBy: ctx.name, printedAt: fmtDateTime(new Date()) });
      await recordExport(ctx, { what: "audit log", entityId: "audit", filters: {}, rows: all.length, redacted: ctx.meetingMode });
      return file(buf, `audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`, "xlsx");
    }
  }

  // ── list and detail pages: same filters as the page
  if (report === "list") {
    const load = LIST_EXPORTS[q("name") ?? ""];
    if (!load) return deny("Unknown export.", 404);
    const def = await load();
    if (!can(ctx, def.cap) || !can(ctx, "reports.export")) return deny("Your role cannot export this list.");
    const out = await def.run(ctx, url.searchParams);
    if (!out) return deny("Not found.", 404);
    const rows = out.tables.reduce((s, t) => s + t.rows.length, 0);
    const o = await org();
    const format = q("format") === "xlsx" ? "xlsx" : "pdf";
    const buf = format === "xlsx"
      ? await toXlsx(out.tables, { org: o.name, printedBy: ctx.name, printedAt: fmtDateTime(new Date()) })
      : await toPdf(
          <Tables
            org={o}
            printed={printed(ctx, out.title)}
            title={out.title}
            subtitle={out.subtitle}
            tables={out.tables.map((t) => ({
              title: t.title,
              note: t.note,
              columns: t.columns.map((c) => ({ label: c.label, align: c.align })),
              rows: t.rows.map((r) => t.columns.map((c) => cellText(r[c.key], c.money))),
              totals: t.totals ? t.columns.map((c) => cellText(t.totals![c.key] ?? null, c.money)) : undefined,
            }))}
          />,
        );
    const filters = Object.fromEntries([...url.searchParams].filter(([k]) => k !== "format"));
    await recordExport(ctx, { what: `${out.title} (${format.toUpperCase()})`, entityId: q("name")!, filters, rows, redacted: out.redacted });
    return file(buf, `${out.title}.${format}`, format, format === "pdf");
  }

  // ── the eight reports
  if (!(report in REPORTS)) return deny("Unknown export.", 404);
  const key = report as ReportKey;
  if (!canViewReport(ctx, key) || !can(ctx, "reports.export")) return deny("Your role can view reports but not export them.");
  const fy = isFiscalYear(q("fy")) ? q("fy")! : getFiscalYear();
  const from = q("from");
  const to = q("to");
  const period = from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
    ? { from: fromDateInput(from), to: new Date(fromDateInput(to).getTime() + 864e5), label: `${from} to ${to}` }
    : fyPeriod(fy);
  const wantUnredacted = q("unredacted") === "1";
  if (wantUnredacted && !can(ctx, "reports.exportUnredacted")) return deny("Only the super admin can export an unredacted beneficiary list.");
  const result = await runReport(ctx, key, period, { unredacted: wantUnredacted });
  const rows = result.tables.reduce((s, t) => s + t.rows.length, 0);
  const o = await org();
  const format = q("format") === "xlsx" ? "xlsx" : "pdf";
  const buf = format === "xlsx"
    ? await toXlsx(result.tables, { org: o.name, printedBy: ctx.name, printedAt: fmtDateTime(new Date()) })
    : await toPdf(
        <Tables
          org={o}
          printed={printed(ctx, `${REPORTS[key].label} · ${period.label}`)}
          title={REPORTS[key].label}
          subtitle={period.label}
          tables={result.tables.map((t) => ({
            title: t.title,
            note: t.note,
            columns: t.columns.map((c) => ({ label: c.label, align: c.align })),
            rows: t.rows.map((r) => t.columns.map((c) => cellText(r[c.key], c.money))),
            totals: t.totals ? t.columns.map((c) => cellText(t.totals![c.key] ?? null, c.money)) : undefined,
          }))}
        />,
      );
  await recordExport(ctx, { what: `${REPORTS[key].label} (${format.toUpperCase()})`, entityId: key, filters: { fy, from, to }, rows, redacted: result.redacted });
  return file(buf, `${key}-${period.label.replace(/\s+/g, "-")}.${format}`, format, false);
}
