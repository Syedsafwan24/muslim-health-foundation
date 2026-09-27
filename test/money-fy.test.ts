import { describe, expect, it } from "vitest";
import { amountInWords, formatINR, groupRupees, paiseToRupeeString, parseRupees } from "@/lib/money";
import { fyRange, getFiscalYear, previousFiscalYear } from "@/lib/fy";

describe("money", () => {
  it("formats paise with Indian grouping", () => {
    expect(formatINR(12500050n)).toBe("₹1,25,000.50");
    expect(formatINR(12500000n)).toBe("₹1,25,000");
    expect(formatINR(-3500000n)).toBe("-₹35,000");
    expect(formatINR(123456789012300n)).toBe("₹12,34,56,78,90,123");
    // Beyond float precision: the string path keeps every paisa.
    expect(formatINR(12345678901234567n)).toBe("₹12,34,56,78,90,12,345.67");
    expect(formatINR(null)).toBe("—");
  });
  it("parses rupee input to BigInt paise, never float", () => {
    expect(parseRupees("1,25,000.50")).toBe(12500050n);
    expect(parseRupees("0.1")).toBe(10n);
    expect(parseRupees("₹ 42")).toBe(4200n);
    expect(parseRupees("12.345")).toBeNull();
    expect(parseRupees("abc")).toBeNull();
    expect(paiseToRupeeString(12500050n)).toBe("125000.50");
    expect(groupRupees("12500000")).toBe("1,25,00,000");
  });
  it("writes amounts in Indian words", () => {
    expect(amountInWords(12500050n)).toBe("Rupees One Lakh Twenty Five Thousand and Fifty Paise Only");
    expect(amountInWords(1000000000n)).toBe("Rupees One Crore Only");
    expect(amountInWords(0n)).toBe("Rupees Zero Only");
  });
});

describe("fiscal year", () => {
  it("runs 1 April – 31 March in IST", () => {
    expect(getFiscalYear(new Date("2026-09-26T10:00:00+05:30"))).toBe("2026-27");
    expect(getFiscalYear(new Date("2026-03-31T23:59:00+05:30"))).toBe("2025-26");
    // 1 April 00:30 IST is still 31 March in UTC — must count as the new year.
    expect(getFiscalYear(new Date("2026-03-31T19:00:00Z"))).toBe("2026-27");
    expect(previousFiscalYear("2026-27")).toBe("2025-26");
    const r = fyRange("2026-27");
    expect(r.start.toISOString()).toBe("2026-03-31T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2027-03-31T18:30:00.000Z");
  });
});
