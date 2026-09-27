import type {
  AttachmentType, DonorType, ExpenseCategory, FundType, Gender, HospitalType, IdType, MaritalStatus,
  PatientRelation, PaymentMode, PaymentStatus, PaymentTowards, Priority, ZakatCategory, AuditAction,
} from "@prisma/client";

// English labels for every enum, in the paper form's wording. Sentence case.

export const GENDER: Record<Gender, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

// "Status" on the paper form = marital status (open question 1 — values pending client wording).
export const MARITAL: Record<MaritalStatus, string> = {
  MARRIED: "Married", UNMARRIED: "Unmarried", WIDOW: "Widow", WIDOWER: "Widower", DIVORCED: "Divorced", UNKNOWN: "Not recorded",
};

export const RELATION: Record<PatientRelation, string> = {
  SELF: "Self", SPOUSE: "Spouse", SON: "Son", DAUGHTER: "Daughter", FATHER: "Father", MOTHER: "Mother",
  BROTHER: "Brother", SISTER: "Sister", GRANDPARENT: "Grandparent", GRANDCHILD: "Grandchild",
  RELATIVE: "Relative", NEIGHBOUR: "Neighbour", OTHER: "Other",
};

export const PRIORITY: Record<Priority, string> = { ROUTINE: "Routine", URGENT: "Urgent", EMERGENCY: "Emergency" };

export const ZAKAT_CATEGORY: Record<ZakatCategory, string> = {
  FAQIR: "Destitute", MISKEEN: "Needy", GHARIM: "In debt", IBN_SABIL: "Stranded traveller", OTHER: "Other",
};

export const HOSPITAL_TYPE: Record<HospitalType, string> = {
  GOVERNMENT: "Government", PRIVATE: "Private", TRUST: "Trust", CLINIC: "Clinic",
  DIAGNOSTIC: "Diagnostic centre", PHARMACY: "Pharmacy", OTHER: "Other",
};

export const PAYMENT_MODE: Record<PaymentMode, string> = {
  CHEQUE: "Cheque", NEFT: "NEFT", RTGS: "RTGS", IMPS: "IMPS", UPI: "UPI", CASH: "Cash", DD: "Demand draft",
};

export const TOWARDS: Record<PaymentTowards, string> = {
  HOSPITAL_BILL: "Hospital bill", MEDICINES: "Medicines", INVESTIGATION: "Investigation", SURGERY: "Surgery",
  IMPLANT: "Implant", TRAVEL: "Travel", APPLICANT_DIRECT: "Paid to applicant", OTHER: "Other",
};

export const PAYMENT_STATUS: Record<PaymentStatus, string> = {
  PENDING: "Pending", ISSUED: "Issued", CLEARED: "Cleared", BOUNCED: "Bounced", CANCELLED: "Cancelled",
};

export const PAYEE_TYPE: Record<string, string> = {
  HOSPITAL: "Hospital", APPLICANT: "Applicant", PATIENT: "Patient", OTHER: "Other",
};

export const ATTACHMENT_TYPE: Record<AttachmentType, string> = {
  GOVT_ID: "Govt ID (Aadhaar or ration card)", HOSPITAL_BILL: "Hospital bill", HOSPITAL_LETTER: "Hospital letter",
  MHF_APPLICATION_FORM: "MHF form", AUTHORISATION_FORM: "Authorisation form",
  DISCHARGE_SUMMARY: "Discharge summary", PRESCRIPTION: "Prescription", LAB_REPORT: "Lab report",
  CHEQUE_COPY: "Cheque copy", RECEIPT: "Receipt", DONATION_PROOF: "Donation proof",
  EXPENSE_BILL: "Expense bill", PHOTO: "Photo", OTHER: "Other",
};

/** Attachment types an accountant may open (financial only). */
export const FINANCIAL_ATTACHMENTS: AttachmentType[] = ["HOSPITAL_BILL", "CHEQUE_COPY", "RECEIPT", "DONATION_PROOF", "EXPENSE_BILL"];

export const EXPENSE_CATEGORY: Record<ExpenseCategory, string> = {
  RENT: "Rent", SALARY: "Salary", UTILITIES: "Utilities", STATIONERY: "Stationery", TRANSPORT: "Transport",
  EVENT: "Event", MAINTENANCE: "Maintenance", BANK_CHARGES: "Bank charges", MISC: "Miscellaneous",
};

export const DONOR_TYPE: Record<DonorType, string> = {
  INDIVIDUAL: "Individual", BUSINESS: "Business", TRUST: "Trust", GOVERNMENT: "Government", ANONYMOUS: "Anonymous",
};

/** Amount filter bands used on the money lists. */
export const AMOUNT_BANDS = {
  "lt10k": { label: "Up to ₹10,000", min: null, max: 1_000_000n },
  "10k-1l": { label: "₹10,000 – ₹1,00,000", min: 1_000_000n, max: 10_000_000n },
  "1l-5l": { label: "₹1,00,000 – ₹5,00,000", min: 10_000_000n, max: 50_000_000n },
  "gt5l": { label: "Over ₹5,00,000", min: 50_000_000n, max: null },
} as const satisfies Record<string, { label: string; min: bigint | null; max: bigint | null }>;
export type AmountBand = keyof typeof AMOUNT_BANDS;

export const FUND_TYPE: Record<FundType, string> = { ZAKAT: "Zakat", SADAQAH: "Sadaqah", GENERAL: "General", OTHER: "Other" };

export const ID_TYPE: Record<IdType, string> = {
  AADHAAR: "Aadhaar", VOTER_ID: "Voter ID", PAN: "PAN", RATION_CARD: "Ration card", PASSPORT: "Passport",
  DRIVING_LICENCE: "Driving licence", OTHER: "Other", NONE: "None",
};

export const AUDIT_ACTION: Record<AuditAction, string> = {
  CREATE: "Created", UPDATE: "Updated", DELETE: "Deleted", RESTORE: "Restored", LOGIN: "Sign-in", LOGOUT: "Sign-out",
  APPROVE: "Approved", REJECT: "Rejected", PAY: "Payment", CANCEL_PAYMENT: "Payment cancelled",
  REVEAL_IDENTITY: "Identity revealed", FILE_VIEW: "File viewed", FILE_DOWNLOAD: "File downloaded",
  EXPORT: "Export", SETTING_CHANGE: "Setting changed", MEETING_MODE_TOGGLE: "Meeting mode switched",
};

/** Options list for a <select>, in declaration order. */
export const options = <K extends string>(m: Record<K, string>) =>
  (Object.entries(m) as [K, string][]).map(([value, label]) => ({ value, label }));

/** The documents collected for every case, in the order the office gathers them. */
export const CASE_DOCUMENTS = [
  { type: "GOVT_ID", label: "Aadhaar card or ration card", hint: "Photo of the Aadhaar card or ration card" },
  { type: "MHF_APPLICATION_FORM", label: "MHF form", hint: "Photo of the filled and signed MHF form" },
  { type: "HOSPITAL_LETTER", label: "Hospital letter", hint: "Letter or estimate from the hospital" },
  { type: "HOSPITAL_BILL", label: "Hospital bill or receipt", hint: "Bill or receipt from the hospital" },
] as const satisfies readonly { type: AttachmentType; label: string; hint: string }[];
