import { nextCounter, type Tx } from "@/lib/db";

// FY-scoped serials, generated inside the caller's transaction via the row-locked Counter.
// Case number format is the proposal pending client confirmation (open question 6).
const pad = (n: number, w: number) => String(n).padStart(w, "0");

export const formatCaseNo = (fy: string, n: number) => `MHF/${fy}/${pad(n, 5)}`;

export async function nextCaseNo(tx: Tx, fy: string) {
  const serial = await nextCounter(tx, `case:${fy}`);
  return { serial, caseNo: formatCaseNo(fy, serial) };
}
export async function nextVoucherNo(tx: Tx, fy: string) {
  return `V/${fy}/${pad(await nextCounter(tx, `voucher:${fy}`), 5)}`;
}
export async function nextReceiptNo(tx: Tx, fy: string) {
  return `R/${fy}/${pad(await nextCounter(tx, `receipt:${fy}`), 5)}`;
}
export async function nextExpenseNo(tx: Tx, fy: string) {
  return `E/${fy}/${pad(await nextCounter(tx, `expense:${fy}`), 5)}`;
}
export async function nextPersonCode(tx: Tx) {
  return `P-${pad(await nextCounter(tx, "person"), 6)}`;
}
export async function nextDonorCode(tx: Tx) {
  return `D-${pad(await nextCounter(tx, "donor"), 5)}`;
}
