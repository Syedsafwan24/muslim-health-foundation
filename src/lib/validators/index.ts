import { z } from "zod";
import { formatINR } from "@/lib/money";
import {
  DONOR_TYPE, EXPENSE_CATEGORY, FUND_TYPE, GENDER, HOSPITAL_TYPE, ID_TYPE, MARITAL, PAYMENT_MODE,
  PRIORITY, RELATION, TOWARDS, ZAKAT_CATEGORY,
} from "@/lib/labels";

// One schema per entity, shared by client forms and server actions.
// Form inputs arrive as strings; blank strings become null.

const keys = <K extends string>(m: Record<K, string>) => Object.keys(m) as [K, ...K[]];
export const enumOf = <K extends string>(m: Record<K, string>) => z.enum(keys(m));

export const optText = (max = 500) =>
  z.string().trim().max(max, `Keep this under ${max} characters`).transform((v) => v || null).nullable().optional().transform((v) => v ?? null);

export const optInt = (min: number, max: number) =>
  z.union([z.number(), z.string()])
    .nullable()
    .optional()
    .transform((v, c) => {
      if (v === "" || v == null) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) {
        c.addIssue({ code: "custom", message: `Enter a whole number from ${min} to ${max}` });
        return z.NEVER;
      }
      return n;
    });

/** Money is BigInt paise at every boundary. */
export const paise = z.bigint({ invalid_type_error: "Enter an amount in rupees" }).nonnegative("Amount cannot be negative");
export const optPaise = paise.nullable().optional().transform((v) => v ?? null);
export const positivePaise = z.bigint({ invalid_type_error: "Enter an amount in rupees" }).positive("Enter an amount greater than zero");

/** yyyy-MM-dd from <input type="date">. */
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");
export const optDateStr = z.string().optional().nullable().transform((v) => (v ? v : null)).pipe(dateStr.nullable());

const mobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  // Accepts 9876543210, 09876543210, 919876543210 and +919876543210; stores the last 10 digits.
  .refine((v) => v === "" || /^(\+?91|0)?\d{10}$/.test(v), "Enter a 10-digit mobile number")
  .transform((v) => (v ? v.slice(-10) : null))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const id = z.string().min(1).max(40);
export const optId = z.string().max(40).optional().nullable().transform((v) => v || null);

// ─────────────────────────── person ───────────────────────────

export const personSchema = z.object({
  personId: optId,
  fullName: z.string().trim().min(2, "Enter the name as written on the form").max(120),
  fatherName: optText(120),
  husbandName: optText(120),
  gender: enumOf(GENDER).nullable().optional().transform((v) => v ?? null),
  ageYears: optInt(0, 120),
  maritalStatus: enumOf(MARITAL).default("UNKNOWN"),
  religion: optText(40),
  mobile,
  altMobile: mobile,
  addressLine: optText(300),
  areaId: optId,
  city: optText(80),
  pincode: z.string().trim().refine((v) => v === "" || /^\d{6}$/.test(v), "Enter a 6-digit pincode").transform((v) => v || null).nullable().optional().transform((v) => v ?? null),
  idType: enumOf(ID_TYPE).default("NONE"),
  /** Plain ID number; encrypted on the server, only the last 4 kept in clear. Blank = unchanged. */
  idNumber: optText(30),
});
export type PersonInput = z.input<typeof personSchema>;

/** Blank person block for the application form. */
export const emptyPerson = (): PersonInput => ({
  personId: null, fullName: "", fatherName: "", husbandName: "", gender: undefined, ageYears: "", maritalStatus: "UNKNOWN",
  religion: "", mobile: "", altMobile: "", addressLine: "", areaId: "", city: "Bhatkal", pincode: "", idType: "NONE", idNumber: "",
});

export const watchSchema = z.object({ personId: id, watchFlag: z.boolean(), watchNote: optText(500) });

export const mergeSchema = z.object({
  keepId: id,
  mergeId: id,
  reason: z.string().trim().min(1, "Say why").max(500),
});

// ─────────────────────────── application ───────────────────────────

export const caseSchema = z.object({
  introducedByName: optText(120),
  introducedByPhone: optText(20),
  attendingDoctor: optText(120),
  hospitalId: optId,
  diseaseId: optId,
  majorProblem: optText(4000),
  admissionDate: optDateStr,
  dischargeDate: optDateStr,
  approxExpensePaise: optPaise,
  requestedAmountPaise: optPaise,
  /** Sanctioned by the trust before the case is entered. Required when the case is recorded. */
  approvedAmountPaise: optPaise,
  priority: enumOf(PRIORITY).default("ROUTINE"),
}).superRefine((c, ctx) => {
  // MHF never approves more than the hospital estimate.
  if (c.approvedAmountPaise != null && c.approxExpensePaise != null && c.approvedAmountPaise > c.approxExpensePaise) {
    ctx.addIssue({ code: "custom", path: ["approvedAmountPaise"], message: `Cannot be more than the approx hospital expenses (${formatINR(c.approxExpensePaise)})` });
  }
});

export const eligibilitySchema = z.object({
  zakatCategory: enumOf(ZAKAT_CATEGORY).nullable().optional().transform((v) => v ?? null),
  monthlyIncomePaise: optPaise,
  dependentsSupported: optInt(0, 40),
  ownsHouse: z.boolean().nullable().optional().transform((v) => v ?? null),
  ownsAgriLand: z.boolean().nullable().optional().transform((v) => v ?? null),
  savingsOrGoldNote: optText(500),
  existingDebtPaise: optPaise,
  eligibilityNote: optText(2000),
  authorisationReceived: z.boolean().default(false),
});

export const applicationSchema = z.object({
  id: optId,
  /** "Date" at the top of the paper form. */
  applicationDate: optDateStr,
  applicant: personSchema,
  patientIsApplicant: z.boolean(),
  patient: personSchema.nullable().optional(),
  relation: enumOf(RELATION).default("SELF"),
  dependentCount: optInt(0, 40),
  case: caseSchema,
  eligibility: eligibilitySchema,
});
export type ApplicationInput = z.input<typeof applicationSchema>;

export const revealSchema = z.object({
  applicationId: id,
  reason: z.string().trim().min(1, "Say why").max(500),
  password: z.string().min(1, "Enter your password"),
});

// ─────────────────────────── payments ───────────────────────────

/**
 * Block D of the paper form: Cheque · INR · Bank · Payment date · Mode of transfer · Towards ·
 * Name of the hospital · Remark. "Cheque" holds the cheque number, or the transaction reference
 * for an electronic transfer.
 */
const blockD = {
  mode: enumOf(PAYMENT_MODE),
  chequeNo: optText(40),
  bankId: optId,
  paymentDate: dateStr,
  towards: enumOf(TOWARDS),
  hospitalId: optId,
  remark: optText(500),
};
type BlockD = { mode: string; chequeNo: string | null; bankId: string | null; towards: string; hospitalId: string | null };
const checkBlockD = (v: BlockD, c: z.RefinementCtx) => {
  if (v.mode !== "CASH" && !v.chequeNo) c.addIssue({ code: "custom", path: ["chequeNo"], message: v.mode === "CHEQUE" ? "Enter the cheque number" : "Enter the transaction reference" });
  if (v.mode === "CHEQUE" && !v.bankId) c.addIssue({ code: "custom", path: ["bankId"], message: "Choose the bank" });
  if (v.towards !== "APPLICANT_DIRECT" && !v.hospitalId) c.addIssue({ code: "custom", path: ["hospitalId"], message: "Choose the hospital" });
};

/** The payment block as entered on the application form, when recording the case. */
export const paymentEntrySchema = z.object({ ...blockD, fundId: optId }).superRefine(checkBlockD);
export type PaymentEntryInput = z.input<typeof paymentEntrySchema>;

/** A payment recorded later from the case's Payments tab. */
export const paymentSchema = z
  .object({ ...blockD, applicationId: id, fundId: optId, amountPaise: positivePaise, overrideNote: optText(500) })
  .superRefine(checkBlockD);
export type PaymentInput = z.input<typeof paymentSchema>;

/** Record an entered case as approved, with its payment if the cheque is already made out. */
export const recordCaseSchema = z.object({ id, payment: paymentEntrySchema.nullable() });

export const clearSchema = z.object({ ids: z.array(id).min(1, "Select at least one payment"), clearedOn: dateStr });
export const reasonSchema = z.object({ id, reason: z.string().trim().min(1, "Say why").max(500) });

// ─────────────────────────── donations ───────────────────────────

export const donorSchema = z.object({
  id: optId,
  name: z.string().trim().min(2, "Enter the donor's name").max(160),
  type: enumOf(DONOR_TYPE).default("INDIVIDUAL"),
  phone: optText(20),
  email: z.string().trim().refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email").transform((v) => v || null).nullable().optional().transform((v) => v ?? null),
  addressLine: optText(300),
  city: optText(80),
  country: optText(80),
  panLast4: z.string().trim().refine((v) => v === "" || /^[0-9A-Z]{4}$/i.test(v), "Enter the last 4 characters of the PAN").transform((v) => v.toUpperCase() || null).nullable().optional().transform((v) => v ?? null),
  isAnonymous: z.boolean().default(false),
  notes: optText(1000),
});

export const donationSchema = z.object({
  id: optId,
  donorId: id,
  // Every donation says which fund it goes to (Zakat, General or Interest).
  fundId: z.string().min(1, "Choose the fund").max(40),
  amountPaise: positivePaise,
  donationDate: dateStr,
  mode: enumOf(PAYMENT_MODE),
  bankId: optId,
  referenceNo: optText(60),
  chequeNo: optText(20),
  purposeNote: optText(500),
  earmarkCaseNo: optText(30),
});

// ─────────────────────────── expenses, funds ───────────────────────────

export const expenseSchema = z.object({
  category: enumOf(EXPENSE_CATEGORY),
  description: z.string().trim().min(3, "Describe the expense").max(300),
  amountPaise: positivePaise,
  expenseDate: dateStr,
  fundId: optId,
  paidTo: optText(120),
  mode: enumOf(PAYMENT_MODE),
  referenceNo: optText(60),
});

export const fundSchema = z.object({
  id: optId,
  name: z.string().trim().min(2).max(60),
  type: enumOf(FUND_TYPE),
  isRestricted: z.boolean(),
  allowsExpenses: z.boolean(),
  isActive: z.boolean(),
  openingBalancePaise: paise,
  password: z.string().min(1, "Enter your password to change fund settings"),
}).superRefine((v, c) => {
  if ((v.type === "ZAKAT" || v.type === "INTEREST") && v.allowsExpenses) c.addIssue({ code: "custom", path: ["allowsExpenses"], message: `${v.type === "ZAKAT" ? "Zakat" : "Interest"} money cannot pay the trust's running costs` });
});

// ─────────────────────────── masters ───────────────────────────

export const hospitalSchema = z.object({
  id: optId,
  name: z.string().trim().min(2, "Enter the hospital name").max(160),
  type: enumOf(HOSPITAL_TYPE),
  addressLine: optText(300),
  city: optText(80),
  state: optText(80),
  phone: optText(20),
  contactPerson: optText(120),
  contactPhone: optText(20),
  email: optText(120),
  isEmpanelled: z.boolean().default(false),
  discountNote: optText(300),
  bankName: optText(120),
  bankAccountLast4: z.string().trim().refine((v) => v === "" || /^\d{4}$/.test(v), "Enter the last 4 digits only").transform((v) => v || null).nullable().optional().transform((v) => v ?? null),
  isActive: z.boolean().default(true),
  notes: optText(1000),
});

export const masterSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("area"), id: optId, name: z.string().trim().min(2).max(80), taluk: optText(80) }),
  z.object({ kind: z.literal("bank"), id: optId, name: z.string().trim().min(2).max(120), branch: optText(120), accountLast4: optText(4), isOwnAccount: z.boolean().default(false) }),
  z.object({ kind: z.literal("category"), id: optId, name: z.string().trim().min(2).max(80), sortOrder: optInt(0, 999) }),
  z.object({ kind: z.literal("disease"), id: optId, name: z.string().trim().min(2).max(120), categoryId: id, isChronic: z.boolean().default(false) }),
]);

// ─────────────────────────── users ───────────────────────────

export const userSchema = z.object({
  id: optId,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["SUPER_ADMIN", "GENERAL_SECRETARY", "COMMITTEE_MEMBER", "OPERATOR", "ACCOUNTANT", "VIEWER"]),
  isActive: z.boolean().default(true),
  forceMeetingMode: z.boolean().default(false),
  newPassword: z.string().optional().transform((v) => v || null).refine((v) => v === null || v.length >= 10, "Use at least 10 characters"),
  adminPassword: z.string().min(1, "Enter your own password to confirm"),
});


// ─────────────────────────── required on the paper form ───────────────────────────

/**
 * Fields that must be filled before moving past a step and before a case is saved. Drafts may
 * be saved without them, so a half-filled form survives a reload.
 */
export const REQUIRED = {
  applicant: { fullName: "name", fatherName: "father name", addressLine: "address", ageYears: "age", gender: "gender", mobile: "mobile no." },
  patient: { fullName: "name", ageYears: "age", gender: "gender" },
  case: { diseaseId: "major problem of the patient", approxExpensePaise: "approx hospital expenses", hospitalId: "name of the hospital" },
} as const;

/** Keys of `fields` that are empty in `values`. */
export function missingRequired(values: Record<string, unknown> | null | undefined, fields: Record<string, string>): string[] {
  return Object.keys(fields).filter((k) => {
    const v = values?.[k];
    return v == null || (typeof v === "string" && v.trim() === "");
  });
}
