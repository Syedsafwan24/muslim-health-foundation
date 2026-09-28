import { UserError } from "@/lib/action";
import { nextCounter, type Tx } from "@/lib/db";
import { fmtDate } from "@/lib/fy";
import { fyOfDate } from "@/lib/fy/db";

// FY-scoped serials, generated inside the caller's transaction via the row-locked Counter.
// Case number format is the proposal pending client confirmation (open question 6).
const pad = (n: number, w: number) => String(n).padStart(w, "0");

export const formatCaseNo = (fy: string, n: number) => `MHF/${fy}/${pad(n, 5)}`;

/**
 * Every FY-numbered record (case, voucher, receipt, expense) passes here, so this is where a
 * year that has not been started, or has been closed, stops new entries.
 */
export async function assertFiscalYearOpen(tx: Tx, fy: string) {
  const row = await tx.fiscalYear.findFirst({ where: { code: fy } });
  if (!row) throw new UserError(`FY ${fy} has not been started. Ask the super admin to start it in Settings → Fiscal years.`);
  if (row.status === "CLOSED") throw new UserError(`FY ${fy} is closed, so nothing new can be recorded in it. Ask the super admin to reopen it if this entry belongs there.`);
}

/** The open year an entry dated `date` belongs to, or a clear error when there is none. */
export async function fiscalYearFor(tx: Tx, date: Date): Promise<string> {
  const fy = await fyOfDate(date, tx);
  if (!fy) throw new UserError(`No fiscal year covers ${fmtDate(date)}. Ask the super admin to start it in Settings → Fiscal years.`);
  await assertFiscalYearOpen(tx, fy);
  return fy;
}

export async function nextCaseNo(tx: Tx, fy: string) {
  await assertFiscalYearOpen(tx, fy);
  const serial = await nextCounter(tx, `case:${fy}`);
  return { serial, caseNo: formatCaseNo(fy, serial) };
}
export async function nextVoucherNo(tx: Tx, fy: string) {
  await assertFiscalYearOpen(tx, fy);
  return `V/${fy}/${pad(await nextCounter(tx, `voucher:${fy}`), 5)}`;
}
export async function nextReceiptNo(tx: Tx, fy: string) {
  await assertFiscalYearOpen(tx, fy);
  return `R/${fy}/${pad(await nextCounter(tx, `receipt:${fy}`), 5)}`;
}
export async function nextExpenseNo(tx: Tx, fy: string) {
  await assertFiscalYearOpen(tx, fy);
  return `E/${fy}/${pad(await nextCounter(tx, `expense:${fy}`), 5)}`;
}
export async function nextPersonCode(tx: Tx) {
  return `P-${pad(await nextCounter(tx, "person"), 6)}`;
}
export async function nextDonorCode(tx: Tx) {
  return `D-${pad(await nextCounter(tx, "donor"), 5)}`;
}
