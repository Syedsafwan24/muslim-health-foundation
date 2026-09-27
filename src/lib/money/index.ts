// Money is always BigInt paise. ₹1,25,000.50 → 12500050n. Never float.

const withPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});
const wholeRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const grouping = new Intl.NumberFormat("en-IN");

export function assertPaise(v: unknown): asserts v is bigint {
  if (typeof v !== "bigint") throw new TypeError("Money must be BigInt paise");
}

/** "₹1,25,000" or "₹1,25,000.50". Paise shown only when non-zero. */
export function formatINR(paise: bigint | null | undefined): string {
  if (paise == null) return "—";
  const neg = paise < 0n;
  const abs = neg ? -paise : paise;
  const rupees = abs / 100n;
  const rem = abs % 100n;
  // Intl accepts decimal strings exactly, so no precision is lost for large amounts.
  const str = rem === 0n
    ? wholeRupees.format(rupees.toString() as unknown as number)
    : withPaise.format(`${rupees}.${rem.toString().padStart(2, "0")}` as unknown as number);
  return neg ? `-${str}` : str;
}

/** Compact form for chart axes and stat deltas: ₹6.4L, ₹1.2Cr. */
export function formatINRCompact(paise: bigint): string {
  const neg = paise < 0n;
  const r = Number(neg ? -paise : paise) / 100;
  const s =
    r >= 1e7 ? `₹${trim(r / 1e7)}Cr` : r >= 1e5 ? `₹${trim(r / 1e5)}L` : r >= 1e3 ? `₹${trim(r / 1e3)}K` : `₹${Math.round(r)}`;
  return neg ? `-${s}` : s;
}
const trim = (n: number) => (Math.round(n * 10) / 10).toString();

/** Indian digit grouping of a rupee string as typed: "125000" → "1,25,000". */
export function groupRupees(input: string): string {
  const clean = input.replace(/[^\d.]/g, "");
  const [int = "", frac] = clean.split(".");
  if (!int && frac === undefined) return "";
  const grouped = int ? grouping.format(BigInt(int) as unknown as number) : "0";
  return frac === undefined ? grouped : `${grouped}.${frac.slice(0, 2)}`;
}

/** "1,25,000.50" → 12500050n. Returns null for empty or invalid input. */
export function parseRupees(input: string): bigint | null {
  const clean = input.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [int, frac = ""] = clean.split(".");
  return BigInt(int) * 100n + BigInt(frac.padEnd(2, "0"));
}

/** 12500050n → "125000.50" (for form inputs). */
export function paiseToRupeeString(paise: bigint | null | undefined): string {
  if (paise == null) return "";
  const rem = paise % 100n;
  return rem === 0n ? (paise / 100n).toString() : `${paise / 100n}.${rem.toString().padStart(2, "0")}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? below100(r) : ""].filter(Boolean).join(" ");
}
function indianWords(n: bigint): string {
  if (n === 0n) return "Zero";
  const parts: string[] = [];
  const crore = n / 10000000n;
  let rest = n % 10000000n;
  if (crore > 0n) parts.push(`${indianWords(crore)} Crore`);
  const lakh = Number(rest / 100000n);
  rest %= 100000n;
  const thousand = Number(rest / 1000n);
  const hundreds = Number(rest % 1000n);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (hundreds) parts.push(below1000(hundreds));
  return parts.join(" ");
}

/** 12500050n → "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only" */
export function amountInWords(paise: bigint): string {
  assertPaise(paise);
  const rupees = paise / 100n;
  const p = Number(paise % 100n);
  return `Rupees ${indianWords(rupees)}${p ? ` and ${below100(p)} Paise` : ""} Only`;
}
