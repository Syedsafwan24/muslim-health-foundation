import "server-only";
import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

// Server-side PDFs. Every page carries a footer with the reference, who printed it and when,
// so a leaked paper can be traced (docs/03 §8).

const dir = path.join(process.cwd(), "src", "lib", "pdf", "fonts");
Font.register({
  family: "Plex",
  fonts: [
    { src: path.join(dir, "IBMPlexSans-Regular.woff"), fontWeight: 400 },
    { src: path.join(dir, "IBMPlexSans-Medium.woff"), fontWeight: 500 },
    { src: path.join(dir, "IBMPlexSans-SemiBold.woff"), fontWeight: 600 },
  ],
});
Font.register({ family: "PlexMono", src: path.join(dir, "IBMPlexMono-Regular.ttf") });
Font.registerHyphenationCallback((w) => [w]);

const NAVY = "#1B2A5B";
const INK = "#16213D";
const SLATE = "#5A6683";
const RULE = "#D7DCE7";
const REDACTED = "#4A3E86";

const s = StyleSheet.create({
  page: { fontFamily: "Plex", fontSize: 10, color: INK, paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40 },
  header: { borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 8, marginBottom: 14, flexDirection: "row", justifyContent: "space-between" },
  org: { fontSize: 14, fontWeight: 600, color: NAVY },
  orgSub: { fontSize: 8.5, color: SLATE, marginTop: 2 },
  docTitle: { fontSize: 12, fontWeight: 600, textAlign: "right" },
  mono: { fontFamily: "PlexMono" },
  block: { borderWidth: 1, borderColor: RULE, borderTopWidth: 2, borderTopColor: NAVY, borderRadius: 4, padding: 10, marginBottom: 10 },
  blockTitle: { fontSize: 10.5, fontWeight: 600, color: NAVY, marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "50%", marginBottom: 6, paddingRight: 8 },
  fieldWide: { width: "100%", marginBottom: 6 },
  label: { fontSize: 7.5, color: SLATE, marginBottom: 1 },
  value: { fontSize: 10 },
  amount: { fontSize: 20, fontWeight: 600 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 6, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: SLATE },
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 36 },
  sig: { width: "30%", borderTopWidth: 0.75, borderTopColor: INK, paddingTop: 4, fontSize: 8.5, textAlign: "center" },
  th: { backgroundColor: NAVY, color: "#FFFFFF", fontWeight: 500, fontSize: 8, paddingVertical: 4, paddingHorizontal: 4 },
  td: { fontSize: 8.5, paddingVertical: 3.5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  redacted: { color: REDACTED },
  note: { fontSize: 8, color: SLATE, marginTop: 4 },
});

export type Org = { name: string; address: string; phone: string; email: string; registrationNo: string; eightyGNo: string };
export type Printed = { reference: string; by: string; at: string };

function Frame({ org, title, subtitle, printed, children, landscape }: { org: Org; title: string; subtitle?: string; printed: Printed; children: React.ReactNode; landscape?: boolean }) {
  return (
    <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={s.page}>
      <View style={s.header} fixed>
        <View>
          <Text style={s.org}>{org.name}</Text>
          <Text style={s.orgSub}>{org.address}</Text>
          {(org.phone || org.email || org.registrationNo) && <Text style={s.orgSub}>{[org.phone, org.email, org.registrationNo && `Reg. ${org.registrationNo}`].filter(Boolean).join(" · ")}</Text>}
        </View>
        <View>
          <Text style={s.docTitle}>{title}</Text>
          {subtitle && <Text style={[s.orgSub, { textAlign: "right" }]}>{subtitle}</Text>}
        </View>
      </View>
      {children}
      <View style={s.footer} fixed>
        <Text>{printed.reference}</Text>
        <Text>Printed by {printed.by} · {printed.at}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  );
}

export function F({ label, value, wide, mono }: { label: string; value?: string | null; wide?: boolean; mono?: boolean }) {
  return (
    <View style={wide ? s.fieldWide : s.field}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, mono ? s.mono : {}]}>{value || "—"}</Text>
    </View>
  );
}

export function Block({ title, children, redacted }: { title: string; children: React.ReactNode; redacted?: boolean }) {
  return (
    <View style={[s.block, redacted ? { borderTopColor: REDACTED } : {}]} wrap={false}>
      <Text style={[s.blockTitle, redacted ? s.redacted : {}]}>{title}</Text>
      <View style={s.grid}>{children}</View>
    </View>
  );
}

// ─────────────────────────── documents ───────────────────────────

export type CaseSheetData = {
  caseNo: string; status: string; date: string;
  applicant: [string, string][]; patient: [string, string][] | null; applicantRedacted: boolean; patientRedacted: boolean;
  caseFields: [string, string][]; eligibility: [string, string][];
  payments: { voucherNo: string; date: string; mode: string; cheque: string; bank: string; towards: string; hospital: string; amount: string; status: string }[];
  decision: [string, string][];
};

export function CaseSheet({ org, d, printed }: { org: Org; d: CaseSheetData; printed: Printed }) {
  return (
    <Document title={`Case sheet ${d.caseNo}`}>
      <Frame org={org} title="Application for medical aid" subtitle={`${d.caseNo} · ${d.status}`} printed={printed}>
        <View style={[s.grid, { marginBottom: 8 }]}>
          <F label="Case no" value={d.caseNo} mono /><F label="Date of application" value={d.date} />
          <F label="Status" value={d.status} />
        </View>
        <Block title={d.patient ? "A — Applicant" : "A — Applicant (also the patient)"} redacted={d.applicantRedacted}>
          {d.applicant.map(([l, v]) => <F key={l} label={l} value={v} />)}
        </Block>
        {d.patient && <Block title="B — Patient" redacted={d.patientRedacted}>{d.patient.map(([l, v]) => <F key={l} label={l} value={v} />)}</Block>}
        <Block title="C — Case">{d.caseFields.map(([l, v]) => <F key={l} label={l} value={v} wide={l.startsWith("Major problem")} />)}</Block>
        {d.eligibility.length > 0 && <Block title="Zakat eligibility">{d.eligibility.map(([l, v]) => <F key={l} label={l} value={v} />)}</Block>}
        {d.decision.length > 0 && <Block title="Decision">{d.decision.map(([l, v]) => <F key={l} label={l} value={v} wide={l === "Note"} />)}</Block>}
        <View style={s.block} wrap={false}>
          <Text style={s.blockTitle}>D — Payment</Text>
          {d.payments.length === 0 ? <Text style={s.note}>No payments recorded.</Text> : (
            <View>
              <View style={{ flexDirection: "row" }}>
                {["Voucher", "Date", "Mode", "Cheque", "Bank", "Towards", "Hospital", "INR", "Status"].map((h, i) => <Text key={h} style={[s.th, { width: ["17%", "9%", "8%", "12%", "11%", "11%", "14%", "10%", "8%"][i] }]}>{h}</Text>)}
              </View>
              {d.payments.map((p) => (
                <View key={p.voucherNo} style={{ flexDirection: "row" }}>
                  {[p.voucherNo, p.date, p.mode, p.cheque, p.bank, p.towards, p.hospital, p.amount, p.status].map((v, i) => <Text key={i} style={[s.td, { width: ["17%", "9%", "8%", "12%", "11%", "11%", "14%", "10%", "8%"][i] }, i === 0 || i === 3 ? s.mono : {}]}>{v}</Text>)}
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={s.sigRow} wrap={false}>
          <Text style={s.sig}>Signature App / PT</Text>
          <Text style={s.sig}>Verified by</Text>
          <Text style={s.sig}>Signature of General Secretary</Text>
        </View>
      </Frame>
    </Document>
  );
}

export type VoucherData = { voucherNo: string; caseNo: string; amount: string; words: string; fields: [string, string][]; reversal: boolean };

export function Voucher({ org, d, printed }: { org: Org; d: VoucherData; printed: Printed }) {
  return (
    <Document title={`Voucher ${d.voucherNo}`}>
      <Frame org={org} title={d.reversal ? "Reversal voucher" : "Payment voucher"} subtitle={d.voucherNo} printed={printed}>
        <View style={s.block}>
          <Text style={s.blockTitle}>D — Payment</Text>
          <Text style={s.amount}>{d.amount}</Text>
          <Text style={[s.note, { marginBottom: 10 }]}>{d.words}</Text>
          <View style={s.grid}>
            <F label="Voucher no" value={d.voucherNo} mono />
            <F label="Case no" value={d.caseNo} mono />
            {d.fields.map(([l, v]) => <F key={l} label={l} value={v} wide={l === "Remark"} />)}
          </View>
        </View>
        <View style={s.sigRow}>
          <Text style={s.sig}>Prepared by</Text>
          <Text style={s.sig}>Signature App / PT</Text>
          <Text style={s.sig}>Signature of General Secretary</Text>
        </View>
      </Frame>
    </Document>
  );
}

export type PaymentReceiptData = {
  voucherNo: string; date: string; paidTo: string; amount: string; words: string; mode: string;
  reference: { label: string; value: string }; fromBank: string; caseNo: string; patient: string; towards: string;
};

/** Given to the hospital or family: proof that MHF paid, by which transfer, for which case. */
export function PaymentReceipt({ org, d, printed }: { org: Org; d: PaymentReceiptData; printed: Printed }) {
  return (
    <Document title={`Payment receipt ${d.voucherNo}`}>
      <Frame org={org} title="Payment receipt" subtitle={d.voucherNo} printed={printed}>
        <View style={s.block}>
          <View style={s.grid}>
            <F label="Voucher no" value={d.voucherNo} mono /><F label="Date" value={d.date} />
            <F label="Paid to" value={d.paidTo} wide />
          </View>
          <Text style={[s.amount, { marginTop: 6 }]}>{d.amount}</Text>
          <Text style={s.note}>{d.words}</Text>
          <View style={[s.grid, { marginTop: 10 }]}>
            <F label="Mode of transfer" value={d.mode} /><F label={d.reference.label} value={d.reference.value} mono />
            <F label="From bank" value={d.fromBank} /><F label="Towards" value={d.towards} />
            <F label="Case no" value={d.caseNo} mono /><F label="Patient" value={d.patient} />
          </View>
        </View>
        <View style={s.block}>
          <Text>
            {org.name} has paid the amount above towards the medical treatment of the patient named, under case {d.caseNo}.
          </Text>
        </View>
        <View style={s.sigRow}>
          <Text style={s.sig}>For {org.name} (authorised signatory)</Text>
          <Text style={s.sig}>Received by (name, signature and stamp)</Text>
        </View>
      </Frame>
    </Document>
  );
}

export type ReceiptData = { receiptNo: string; date: string; donor: string; address: string; pan: string; amount: string; words: string; fund: string; mode: string; reference: string; cancelled: boolean };

export function Receipt({ org, d, printed }: { org: Org; d: ReceiptData; printed: Printed }) {
  return (
    <Document title={`Receipt ${d.receiptNo}`}>
      <Frame org={org} title={d.cancelled ? "Donation receipt — CANCELLED" : "Donation receipt"} subtitle={d.receiptNo} printed={printed}>
        <View style={s.block}>
          <View style={s.grid}>
            <F label="Receipt no" value={d.receiptNo} mono /><F label="Date" value={d.date} />
            <F label="Received with thanks from" value={d.donor} wide /><F label="Address" value={d.address} wide />
          </View>
          <Text style={[s.amount, { marginTop: 6 }]}>{d.amount}</Text>
          <Text style={s.note}>{d.words}</Text>
          <View style={[s.grid, { marginTop: 10 }]}>
            <F label="Fund" value={d.fund} /><F label="Mode" value={d.mode} /><F label="Reference" value={d.reference} mono />
            {org.eightyGNo ? <F label="Donor PAN" value={d.pan ? `ending ${d.pan}` : "Not provided"} /> : null}
          </View>
        </View>
        {org.eightyGNo ? (
          <View style={s.block}>
            <Text style={s.blockTitle}>Section 80G</Text>
            <Text>Donations to {org.name} are eligible for deduction under section 80G of the Income-tax Act, 1961. Registration no. {org.eightyGNo}.</Text>
          </View>
        ) : null}
        <View style={s.sigRow}><Text style={[s.sig, { marginLeft: "auto" }]}>Authorised signatory</Text></View>
      </Frame>
    </Document>
  );
}

export type TableDoc = { title: string; columns: { label: string; align?: "right"; width?: number }[]; rows: string[][]; totals?: string[]; note?: string };

export function Tables({ org, title, subtitle, tables, printed, landscape = true }: { org: Org; title: string; subtitle?: string; tables: TableDoc[]; printed: Printed; landscape?: boolean }) {
  return (
    <Document title={title}>
      <Frame org={org} title={title} subtitle={subtitle} printed={printed} landscape={landscape}>
        {tables.map((t, ti) => {
          const widths = t.columns.map((c) => c.width ?? 1);
          const total = widths.reduce((a, b) => a + b, 0);
          const w = (i: number) => `${(widths[i] / total) * 100}%`;
          return (
            <View key={ti} style={{ marginBottom: 14 }} break={ti > 0 && t.rows.length > 25}>
              <Text style={s.blockTitle}>{t.title}</Text>
              <View style={{ flexDirection: "row" }} fixed>
                {t.columns.map((c, i) => <Text key={i} style={[s.th, { width: w(i), textAlign: c.align === "right" ? "right" : "left" }]}>{c.label}</Text>)}
              </View>
              {t.rows.length === 0 && <Text style={s.note}>Nothing to report.</Text>}
              {t.rows.map((r, ri) => (
                <View key={ri} style={{ flexDirection: "row" }} wrap={false}>
                  {r.map((v, i) => <Text key={i} style={[s.td, { width: w(i), textAlign: t.columns[i].align === "right" ? "right" : "left" }]}>{v}</Text>)}
                </View>
              ))}
              {t.totals && (
                <View style={{ flexDirection: "row" }}>
                  {t.totals.map((v, i) => <Text key={i} style={[s.td, { width: w(i), fontWeight: 600, textAlign: t.columns[i].align === "right" ? "right" : "left" }]}>{v}</Text>)}
                </View>
              )}
              {t.note && <Text style={s.note}>{t.note}</Text>}
            </View>
          );
        })}
      </Frame>
    </Document>
  );
}

export async function toPdf(doc: ReactElement): Promise<Buffer> {
  // renderToBuffer's type wants a Document element; our components return one.
  return renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
}
