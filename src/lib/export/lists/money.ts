import "server-only";
import { fmtDate } from "@/lib/fy";
import { readParams } from "@/lib/params";
import { DONOR_TYPE, EXPENSE_CATEGORY, PAYMENT_MODE, PAYMENT_STATUS, TOWARDS } from "@/lib/labels";
import { listPayments, paymentFilters } from "@/lib/db/queries/payments";
import { donationFilters, donorFilters, expenseFilters, listDonations, listDonors, listExpenses } from "@/lib/db/queries/donations";
import type { ViewContext } from "@/lib/redact";
import type { ListExport } from "../lists";

// The money lists, exported with the page's own filters and sort, through the page's own (redacted) query.
const params = (sp: URLSearchParams) => readParams(Promise.resolve(Object.fromEntries(sp)));
const asOn = () => `As on ${fmtDate(new Date())}`;

export const paymentsExport: ListExport = {
  cap: "payments.read",
  run: async (ctx: ViewContext, sp: URLSearchParams) => {
    const d = await listPayments(ctx, { ...paymentFilters(await params(sp), ctx), all: true });
    return {
      title: "Payments", subtitle: asOn(), redacted: ctx.meetingMode,
      tables: [{
        title: "Payments",
        columns: [
          { key: "voucher", label: "Voucher" }, { key: "date", label: "Date" }, { key: "caseNo", label: "Case" }, { key: "payee", label: "Payee" },
          { key: "mode", label: "Mode" }, { key: "ref", label: "Cheque / ref" }, { key: "towards", label: "Towards" }, { key: "fund", label: "Fund" },
          { key: "amount", label: "Amount", align: "right", money: true }, { key: "status", label: "Status" },
        ],
        rows: d.rows.map((r) => ({
          voucher: r.voucherNo, date: fmtDate(r.paymentDate), caseNo: r.caseNo, payee: r.hospitalName ?? r.payeeName ?? (r.payeeName === undefined ? "Hidden" : ""),
          mode: PAYMENT_MODE[r.mode], ref: r.chequeNo ?? r.referenceNo, towards: TOWARDS[r.towards], fund: r.fundName, amount: r.amountPaise,
          status: [PAYMENT_STATUS[r.status], r.isReversal ? "Reversal" : "", r.reversed ? "Reversed" : ""].filter(Boolean).join(" · "),
        })),
        totals: { voucher: "Paid out (excluding cancelled and bounced)", amount: d.stats.paidPaise },
      }],
    };
  },
};

export const donationsExport: ListExport = {
  cap: "donations.read",
  run: async (ctx: ViewContext, sp: URLSearchParams) => {
    const d = await listDonations(ctx, { ...donationFilters(await params(sp), ctx), all: true });
    return {
      title: "Donations", subtitle: asOn(), redacted: d.rows.some((r) => r.donorName === "Anonymous donor"),
      tables: [{
        title: "Donations",
        columns: [
          { key: "receipt", label: "Receipt no" }, { key: "date", label: "Date" }, { key: "donor", label: "Donor" }, { key: "fund", label: "Fund" },
          { key: "mode", label: "Mode" }, { key: "ref", label: "Reference" }, { key: "amount", label: "Amount", align: "right", money: true }, { key: "status", label: "Status" },
        ],
        rows: d.rows.map((r) => ({
          receipt: r.receiptNo, date: fmtDate(r.donationDate), donor: r.donorName, fund: r.fundName, mode: PAYMENT_MODE[r.mode],
          ref: r.chequeNo ?? r.referenceNo, amount: r.amountPaise, status: r.cancelled ? "Cancelled" : r.isReceiptIssued ? "Receipt issued" : "Receipt pending",
        })),
        totals: { receipt: "Received (excluding cancelled)", amount: d.stats.receivedPaise },
      }],
    };
  },
};

export const donorsExport: ListExport = {
  cap: "donations.read",
  run: async (ctx: ViewContext, sp: URLSearchParams) => {
    const f = donorFilters(await params(sp));
    const d = await listDonors(ctx, { ...f, all: true });
    return {
      title: "Donors", subtitle: asOn(), redacted: d.rows.some((r) => r.name === "Anonymous donor"),
      tables: [{
        title: "Donors",
        columns: [
          { key: "code", label: "Code" }, { key: "name", label: "Donor" }, { key: "type", label: "Type" }, { key: "city", label: "City" },
          { key: "count", label: "Donations", align: "right" }, { key: "last", label: "Last donation" },
          { key: "total", label: f.from || f.to ? "Given in dates" : "Lifetime given", align: "right", money: true },
          { key: "fy", label: `Given in FY ${ctx.fy}`, align: "right", money: true },
        ],
        // listDonors already nulls city (and phone) for anonymous donors the role may not see.
        rows: d.rows.map((r) => ({
          code: r.donorCode, name: r.name, type: DONOR_TYPE[r.type], city: r.city, count: r.count,
          last: r.lastDonationAt ? fmtDate(r.lastDonationAt) : null, total: r.lifetimePaise, fy: r.fyPaise,
        })),
      }],
    };
  },
};

export const expensesExport: ListExport = {
  cap: "expenses.read",
  run: async (ctx: ViewContext, sp: URLSearchParams) => {
    const d = await listExpenses(ctx, { ...expenseFilters(await params(sp), ctx), all: true });
    return {
      title: "Expenses", subtitle: asOn(), redacted: false,
      tables: [{
        title: "Expenses",
        columns: [
          { key: "voucher", label: "Voucher" }, { key: "date", label: "Date" }, { key: "category", label: "Category" }, { key: "description", label: "Description" },
          { key: "paidTo", label: "Paid to" }, { key: "mode", label: "Mode" }, { key: "fund", label: "Fund" }, { key: "amount", label: "Amount", align: "right", money: true },
        ],
        rows: d.rows.map((r) => ({
          voucher: r.voucherNo, date: fmtDate(r.expenseDate), category: EXPENSE_CATEGORY[r.category], description: r.description,
          paidTo: r.paidTo, mode: PAYMENT_MODE[r.mode], fund: r.fundName, amount: r.amountPaise,
        })),
        totals: { voucher: "Spent", amount: d.stats.spentPaise },
      }],
    };
  },
};
