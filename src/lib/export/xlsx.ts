import "server-only";
import ExcelJS from "exceljs";
import type { ReportTable } from "@/lib/db/queries/reports";

/** One sheet per report table. Money is written as rupees (number) with Indian grouping format. */
export async function toXlsx(tables: ReportTable[], meta: { org: string; printedBy: string; printedAt: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.org;
  wb.created = new Date();
  const used = new Set<string>();
  for (const t of tables) {
    let name = t.title.replace(/[\\/*?:[\]]/g, "").slice(0, 28) || "Report";
    for (let i = 2; used.has(name); i++) name = `${name.slice(0, 25)} ${i}`;
    used.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow([t.title]).font = { bold: true, size: 13 };
    ws.addRow([`${meta.org} · printed by ${meta.printedBy} · ${meta.printedAt}`]).font = { italic: true, size: 9, color: { argb: "FF5A6683" } };
    ws.addRow([]);
    const header = ws.addRow(t.columns.map((c) => c.label));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2A5B" } }; });
    const cell = (v: unknown, money?: boolean) => (typeof v === "bigint" ? (money ? Number(v) / 100 : Number(v)) : v ?? "");
    for (const r of t.rows) ws.addRow(t.columns.map((c) => cell(r[c.key], c.money)));
    if (t.totals) ws.addRow(t.columns.map((c) => cell(t.totals![c.key], c.money))).font = { bold: true };
    t.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(48, Math.max(12, c.label.length + 4, ...t.rows.slice(0, 200).map((r) => String(cell(r[c.key], c.money)).length + 2)));
      if (c.money) col.numFmt = "[>=10000000]₹##\\,##\\,##\\,##0.00;[>=100000]₹##\\,##\\,##0.00;₹##,##0.00";
      if (c.align === "right") col.alignment = { horizontal: "right" };
    });
    if (t.note) ws.addRow([]).getCell(1).value = t.note;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
