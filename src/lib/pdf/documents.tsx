import "server-only";
import path from "node:path";
import { Circle, Document, Font, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { LOGO_LETTERS } from "@/lib/logo";
import type { ReactElement } from "react";

// Server-side PDFs. Every page carries a footer with the reference, who printed it and when,
// so a leaked paper can be traced (docs/03 §8).

const dir = path.join(process.cwd(), "src", "lib", "pdf", "fonts");
// Atkinson Hyperlegible Next, the interface face (easy for elderly readers): static TTF instances
// because react-pdf cannot read woff2. Identifiers stay in IBM Plex Mono.
Font.register({
  family: "Sans",
  fonts: [
    { src: path.join(dir, "AtkinsonHyperlegibleNext-Regular.ttf"), fontWeight: 400 },
    { src: path.join(dir, "AtkinsonHyperlegibleNext-Medium.ttf"), fontWeight: 500 },
    { src: path.join(dir, "AtkinsonHyperlegibleNext-SemiBold.ttf"), fontWeight: 600 },
  ],
});
Font.register({ family: "PlexMono", src: path.join(dir, "IBMPlexMono-Regular.ttf") });
Font.registerHyphenationCallback((w) => [w]);

const NAVY = "#1B2A5B";
const INK = "#16213D";
const SLATE = "#5A6683";
const RULE = "#D7DCE7";

const s = StyleSheet.create({
  page: { fontFamily: "Sans", fontSize: 11, color: INK, paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40 },
  header: { borderBottomWidth: 2, borderBottomColor: NAVY, paddingBottom: 8, marginBottom: 14, flexDirection: "row", justifyContent: "space-between" },
  org: { fontSize: 15, fontWeight: 600, color: NAVY },
  orgSub: { fontSize: 9.5, color: SLATE, marginTop: 2 },
  docTitle: { fontSize: 13, fontWeight: 600, textAlign: "right" },
  mono: { fontFamily: "PlexMono" },
  block: { borderWidth: 1, borderColor: RULE, borderTopWidth: 2, borderTopColor: NAVY, borderRadius: 4, padding: 10, marginBottom: 10 },
  blockTitle: { fontSize: 11.5, fontWeight: 600, color: NAVY, marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "50%", marginBottom: 6, paddingRight: 8 },
  fieldWide: { width: "100%", marginBottom: 6 },
  label: { fontSize: 8.5, color: SLATE, marginBottom: 1 },
  value: { fontSize: 11 },
  amount: { fontSize: 22, fontWeight: 600 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 6, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: SLATE },
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 36 },
  sig: { width: "30%", borderTopWidth: 0.75, borderTopColor: INK, paddingTop: 4, fontSize: 9.5, textAlign: "center" },
  th: { backgroundColor: NAVY, color: "#FFFFFF", fontWeight: 500, fontSize: 9, paddingVertical: 4, paddingHorizontal: 4 },
  td: { fontSize: 9.5, paddingVertical: 3.5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: RULE },
  note: { fontSize: 9, color: SLATE, marginTop: 4 },
  // The paper application form: letterhead, then label + value on a dotted line.
  lhRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lhName: { fontSize: 19, fontWeight: 600, color: NAVY, letterSpacing: 0.5 },
  lhReg: { fontSize: 8, fontWeight: 600, color: NAVY, marginLeft: 1 },
  lhAddr: { fontSize: 10.5, color: INK, textAlign: "center", marginTop: 3 },
  rule2: { borderTopWidth: 2, borderTopColor: NAVY, marginTop: 8 },
  rule1: { borderTopWidth: 0.75, borderTopColor: NAVY, marginTop: 1.5, marginBottom: 6 },
  paperTitle: { fontSize: 12, fontWeight: 600, color: NAVY, textAlign: "center", marginBottom: 4 },
  // Labels sit on the value's first line (same size, so the baselines match); every dotted line in
  // a row is stretched to the row's bottom, so neighbours stay level when one value wraps.
  line: { flexDirection: "row", marginTop: 8 },
  lineCell: { flexDirection: "row" },
  lineLabel: { fontSize: 11.5, lineHeight: 1.35, fontWeight: 500, marginRight: 4 },
  lineValue: { flexGrow: 1, flexShrink: 1, flexBasis: 0, fontSize: 11.5, lineHeight: 1.35, paddingLeft: 3, borderBottomWidth: 0.9, borderBottomColor: SLATE, borderBottomStyle: "dotted" },
  para: { fontSize: 11.5, lineHeight: 1.35, paddingLeft: 3, marginTop: 2, borderBottomWidth: 0.9, borderBottomColor: SLATE, borderBottomStyle: "dotted" },
  continued: { position: "absolute", top: 12, left: 40, right: 40, fontSize: 8.5, color: SLATE },
  paperSig: { fontSize: 10.5, fontWeight: 600, marginTop: 26 },
  solid: { borderTopWidth: 1.5, borderTopColor: NAVY, marginTop: 8, marginBottom: 2 },
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
      <Footer printed={printed} />
    </Page>
  );
}

function Footer({ printed }: { printed: Printed }) {
  return (
    <View style={s.footer} fixed>
      <Text>{printed.reference}</Text>
      <Text>Printed by {printed.by} · {printed.at}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

const Seal = () => (
  <Svg viewBox="0 0 100 100" style={{ width: 44, height: 44 }}>
    <Circle cx="50" cy="50" r="50" fill={NAVY} />
    <Path d={LOGO_LETTERS} fill="#FFFFFF" />
  </Svg>
);

/** The letterhead of the MHF paper form: seal, name with ®, address, double rule. */
function Letterhead({ org }: { org: Org }) {
  return (
    <View>
      <View style={s.lhRow}>
        <Seal />
        <View style={{ alignItems: "center", flexGrow: 1, paddingHorizontal: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <Text style={s.lhName}>{org.name.toUpperCase()}</Text>
            <Text style={s.lhReg}>®</Text>
          </View>
          <Text style={s.lhAddr}>{org.address || "Jamat Complex, 1st Floor, N.H.66, Near Noor Masjid, Bhatkal - 581 320."}</Text>
          {(org.phone || org.email || org.registrationNo) && <Text style={[s.orgSub, { textAlign: "center" }]}>{[org.phone, org.email, org.registrationNo && `Reg. ${org.registrationNo}`].filter(Boolean).join(" · ")}</Text>}
        </View>
        <Seal />
      </View>
      <View style={s.rule2} />
      <View style={s.rule1} />
    </View>
  );
}

/**
 * One line of the paper form: one or more "Label ......value......" fields side by side.
 * Widths are percentages on one grid (COL), so the columns line up from row to row. Long values
 * wrap inside their field; very long free text goes through LongLn instead.
 */
type Cell = [label: string, value?: string | null, widthPct?: number];
const COL = { a: 36, b: 34, c: 30 } as const;
function Ln({ cells, mono }: { cells: Cell[]; mono?: boolean }) {
  return (
    <View style={s.line} wrap={false}>
      {cells.map(([label, value, w = 100 / cells.length], i) => (
        <View key={i} style={[s.lineCell, { width: `${w}%`, paddingLeft: i ? 10 : 0 }]}>
          <Text style={s.lineLabel}>{label}</Text>
          <Text style={[s.lineValue, mono ? s.mono : {}]}>{value || " "}</Text>
        </View>
      ))}
    </View>
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

/** Free text that may be long: on its line while short, otherwise full width under its label. */
function LongLn({ label, value }: { label: string; value: string }) {
  if (value.length <= 70) return <Ln cells={[[label, value]]} />;
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={s.lineLabel} minPresenceAhead={30}>{label}</Text>
      <Text style={s.para}>{value}</Text>
    </View>
  );
}

// ─────────────────────────── documents ───────────────────────────

/** One person block of the paper form. Redacted people arrive already blanked by the server. */
export type PaperPerson = {
  name: string; father: string; spouseLabel: string; spouse: string; address: string;
  marital: string; age: string; gender: string; religion: string; mobile: string;
};

export type CaseSheetData = {
  caseNo: string; status: string; date: string;
  applicant: PaperPerson; patient: PaperPerson | null; // null: the applicant is the patient
  relation: string; dependent: string; introducedBy: string; doctor: string;
  problem: string; approxExpense: string; approved: string; hospital: string;
  payments: { cheque: string; amount: string; bank: string; date: string; mode: string; towards: string; hospital: string; remark: string }[];
};

function PersonLines({ who, p }: { who: "Applicant" | "Patient"; p: PaperPerson }) {
  return (
    <>
      <Ln cells={[[`Name of the ${who}`, p.name]]} />
      <Ln cells={[["Father Name", p.father]]} />
      <Ln cells={[[p.spouseLabel, p.spouse]]} />
      <Ln cells={[[`${who} Address`, p.address]]} />
      <Ln cells={[["Marital status", p.marital, COL.a], ["Age", p.age, COL.b], ["Gender", p.gender, COL.c]]} />
    </>
  );
}

/** The application printed on the layout of the MHF paper form, in English. */
export function CaseSheet({ org, d, printed }: { org: Org; d: CaseSheetData; printed: Printed }) {
  const pays = d.payments.length ? d.payments : [{ cheque: "", amount: "", bank: "", date: "", mode: "", towards: "", hospital: "", remark: "" }];
  return (
    <Document title={`Case sheet ${d.caseNo}`}>
      <Page size="A4" style={[s.page, { paddingTop: 28 }]}>
        <Text style={s.continued} fixed render={({ pageNumber }) => (pageNumber > 1 ? `Application ${d.caseNo} (continued)` : "")} />
        <Letterhead org={org} />
        <Ln cells={[["Case no", `${d.caseNo} · ${d.status}`, COL.a + COL.b], ["Date:", d.date, COL.c]]} />

        <PersonLines who="Applicant" p={d.applicant} />
        <Ln cells={[["Religion", d.applicant.religion, COL.a], ["Mobile No:", d.applicant.mobile, COL.b + COL.c]]} />
        {d.patient ? (
          <>
            <PersonLines who="Patient" p={d.patient} />
            <Ln cells={[["Religion", d.patient.religion, COL.a], ["Mobile No:", d.patient.mobile, COL.b], ["Dependent", d.dependent, COL.c]]} />
          </>
        ) : (
          <Ln cells={[["Name of the Patient", "Same as the applicant", COL.a + COL.b], ["Dependent", d.dependent, COL.c]]} />
        )}
        <Ln cells={[["Applicant Relation with Patient", d.relation]]} />
        <Ln cells={[["Introduce by", d.introducedBy, COL.a], ["Attending Dr.", d.doctor, COL.b + COL.c]]} />
        <LongLn label="Major Problem of the Patient" value={d.problem} />
        {/* The last lines of the case stay with the applicant's signature. */}
        <View wrap={false}>
          <Ln cells={[["Approx Hospital Expenses", d.approxExpense, COL.a + COL.b], ["Approved", d.approved, COL.c]]} />
          <Ln cells={[["Name of the Hospital", d.hospital]]} />
          <Text style={[s.paperSig, { textAlign: "right" }]}>Signature App / PT</Text>
        </View>

        <View style={s.solid} />
        {pays.map((p, i) => (
          <View key={i} wrap={false} style={i ? { marginTop: 6, paddingTop: 2, borderTopWidth: 0.5, borderTopColor: RULE } : {}}>
            <Ln cells={[["Cheque", p.cheque, COL.a], ["INR", p.amount, COL.b], ["Bank", p.bank, COL.c]]} />
            <Ln cells={[["Payment Date", p.date, COL.a], ["Mod of Transfer", p.mode, COL.b], ["Towards", p.towards, COL.c]]} />
            <Ln cells={[["Name of the Hospital", p.hospital]]} />
            <Ln cells={[["Remark", p.remark]]} />
          </View>
        ))}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }} wrap={false}>
          <Text style={[s.paperSig, { marginTop: 34 }]}>Signature App / PT</Text>
          <Text style={[s.paperSig, { marginTop: 34 }]}>Signature of General Secretary</Text>
        </View>
        <Footer printed={printed} />
      </Page>
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
      <Page size="A4" style={[s.page, { paddingTop: 28 }]}>
        <Letterhead org={org} />
        <Text style={s.paperTitle}>Payment receipt</Text>
        <Ln cells={[["Voucher no", d.voucherNo, COL.a + COL.b], ["Date:", d.date, COL.c]]} />
        <Ln cells={[["Paid to", d.paidTo]]} />
        <Ln cells={[["The sum of Rupees", d.words]]} />
        <View style={[s.line, { marginTop: 12, alignItems: "center" }]}>
          <Text style={s.lineLabel}>INR</Text>
          <Text style={[s.amount, { borderWidth: 1, borderColor: NAVY, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 2 }]}>{d.amount}</Text>
        </View>
        <Ln cells={[["Mod of Transfer", d.mode, COL.a], [d.reference.label, d.reference.value, COL.b + COL.c]]} />
        <Ln cells={[["From bank", d.fromBank, COL.a], ["Towards", d.towards, COL.b + COL.c]]} />
        <Ln cells={[["Case no", d.caseNo, COL.a], ["Patient", d.patient, COL.b + COL.c]]} />
        <Text style={{ marginTop: 16, fontSize: 11, lineHeight: 1.5 }}>
          {org.name} has paid the amount above towards the medical treatment of the patient named, under case {d.caseNo}.
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }} wrap={false}>
          <Text style={[s.paperSig, { marginTop: 48 }]}>For {org.name}{"\n"}(authorised signatory)</Text>
          <Text style={[s.paperSig, { marginTop: 48, textAlign: "right" }]}>Received by{"\n"}(name, signature and stamp)</Text>
        </View>
        <Footer printed={printed} />
      </Page>
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
