// A case from walk-in to cheque cleared, through the real server actions, against the seeded
// test database. Checks the rules that matter for money: guarded transitions, the eligibility
// gate, the approved-amount cap, fund balance, counter-entry reversals, and one audit row per
// mutation.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";

const session = { user: { id: "", role: "SUPER_ADMIN" as Role } };
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => session), verifyPassword: vi.fn(async () => true), signOut: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Map() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { prisma } = await import("@/lib/db");
const { emptyPerson } = await import("@/lib/validators");
const apps = await import("@/app/(app)/applications/actions");
const pays = await import("@/app/(app)/payments/actions");
const dons = await import("@/app/(app)/donations/actions");
const exps = await import("@/app/(app)/expenses/actions");
const fys = await import("@/app/(app)/settings/fiscal-years/actions");
const { fundBalance } = await import("@/lib/db/queries/funds");
const { toDateInput } = await import("@/lib/fy");

const as = async (role: Role) => {
  const u = await prisma.user.findFirstOrThrow({ where: { role } });
  session.user.id = u.id;
  session.user.role = role;
};
const ok = <T,>(r: { ok: true; data: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

let appId = "";
let hospitalId = "";
let diseaseId = "";
let zakatId = "";
const stamp = Date.now().toString(36);

beforeAll(async () => {
  hospitalId = (await prisma.hospital.findFirstOrThrow({ where: { isActive: true } })).id;
  diseaseId = (await prisma.disease.findFirstOrThrow()).id;
  zakatId = (await prisma.fund.findFirstOrThrow({ where: { type: "ZAKAT", isActive: true } })).id;
  await prisma.setting.upsert({ where: { key: "meetingMode.global" }, create: { key: "meetingMode.global", value: false }, update: { value: false } });
});

afterAll(() => prisma.$disconnect());

describe("an approved case from entry to paid", () => {
  const paper = (name: string, approved: bigint | null) => ({
    applicationDate: toDateInput(new Date()),
    applicant: { ...emptyPerson(), fullName: name, fatherName: "Test Father", addressLine: "Masjid Lane, Bhatkal", mobile: `9${String(Date.now()).slice(-9)}`, ageYears: 40, gender: "MALE" as const },
    patientIsApplicant: true,
    relation: "SELF" as const,
    case: { hospitalId, diseaseId, approxExpensePaise: 8000000n, approvedAmountPaise: approved },
    eligibility: {},
  });
  const attachRequired = async (id: string) => {
    const u = await prisma.user.findFirstOrThrow({ where: { role: "OPERATOR" } });
    for (const type of ["GOVT_ID", "MHF_APPLICATION_FORM", "HOSPITAL_BILL", "HOSPITAL_LETTER"] as const) {
      await prisma.attachment.create({ data: { type, storageKey: `test/${id}/${type}`, originalName: "x.pdf", mimeType: "application/pdf", sizeBytes: 1, applicationId: id, uploadedById: u.id } });
    }
  };

  it("saves a draft with a new applicant, audited", async () => {
    await as("OPERATOR");
    const before = await prisma.auditLog.count();
    const r = ok(await apps.saveApplication(paper(`Test Applicant ${stamp}`, null)));
    appId = r.id;
    expect(r.caseNo).toMatch(/^DRAFT\//);
    expect(await prisma.auditLog.count()).toBeGreaterThanOrEqual(before + 2); // person + application
  });

  it("cannot be saved as a case without the four documents and the approved amount", async () => {
    const noDocs = await apps.submitApplication({ id: appId, payment: null });
    expect(noDocs.ok).toBe(false);
    await attachRequired(appId);
    const noAmount = await apps.submitApplication({ id: appId, payment: null });
    expect(noAmount.ok).toBe(false);
    if (!noAmount.ok) expect(noAmount.error).toMatch(/approved amount/);
    ok(await apps.saveApplication({ ...paper(`Test Applicant ${stamp}`, 4000000n), id: appId }));
    const s = ok(await apps.submitApplication({ id: appId, payment: null }));
    expect(s.caseNo).toMatch(/^MHF\/\d{4}-\d{2}\/\d{5}$/);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe("APPROVED");
  });

  it("refuses to save a case whose applicant is missing required details", async () => {
    await as("OPERATOR");
    const base = paper(`No Father ${stamp}`, 100000n);
    const d = ok(await apps.saveApplication({ ...base, applicant: { ...base.applicant, fatherName: "", addressLine: "" } }));
    await attachRequired(d.id);
    const r = await apps.submitApplication({ id: d.id, payment: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/applicant.s father name, applicant.s address/);
  });

  it("records the cheque from the paper form together with the case", async () => {
    await as("OPERATOR");
    const d = ok(await apps.saveApplication(paper(`Paid At Entry ${stamp}`, 250000n)));
    await attachRequired(d.id);
    const bankId = (await prisma.bank.findFirstOrThrow({ where: { isOwnAccount: true } })).id;
    const cheque = { mode: "CHEQUE" as const, chequeNo: `E${stamp}`.slice(0, 12), bankId, paymentDate: toDateInput(new Date()), towards: "HOSPITAL_BILL" as const, hospitalId, remark: "", fundId: zakatId };
    // An operator enters the case but may not issue the cheque.
    const refused = await apps.submitApplication({ id: d.id, payment: cheque });
    expect(refused.ok).toBe(false);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("DRAFT");
    await as("GENERAL_SECRETARY");
    ok(await apps.submitApplication({ id: d.id, payment: cheque }));
    const a = await prisma.application.findUniqueOrThrow({ where: { id: d.id }, include: { payments: true } });
    expect(a.status).toBe("PAID");
    expect(a.payments).toHaveLength(1);
    expect(a.payments[0].amountPaise).toBe(250000n);
  });

  it("caps payments at the approved amount unless overridden", async () => {
    await as("ACCOUNTANT");
    const base = { applicationId: appId, mode: "CHEQUE" as const, chequeNo: `T${stamp}`.slice(0, 12), bankId: (await prisma.bank.findFirstOrThrow({ where: { isOwnAccount: true } })).id, paymentDate: toDateInput(new Date()), towards: "HOSPITAL_BILL" as const, hospitalId, fundId: zakatId };
    const over = await pays.recordPayment({ ...base, amountPaise: 4000001n });
    expect(over.ok).toBe(false);
    const balanceBefore = await fundBalance(zakatId);
    const p1 = ok(await pays.recordPayment({ ...base, amountPaise: 1500000n }));
    expect(p1.voucherNo).toMatch(/^V\/\d{4}-\d{2}\/\d{5}$/);
    expect(await fundBalance(zakatId)).toBe(balanceBefore - 1500000n);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe("PAYMENT_PENDING");
    const p2 = ok(await pays.recordPayment({ ...base, chequeNo: `U${stamp}`.slice(0, 12), amountPaise: 2500000n }));
    expect((await prisma.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe("PAID");

    // Clear the second, then cancel it: a cleared payment is never edited, only reversed.
    ok(await pays.markCleared({ ids: [p2.id], clearedOn: toDateInput(new Date()) }));
    ok(await pays.cancelPayment({ id: p2.id, reason: "wrong hospital" }));
    const original = await prisma.payment.findUniqueOrThrow({ where: { id: p2.id } });
    expect(original.status).toBe("CLEARED");
    const reversal = await prisma.payment.findFirstOrThrow({ where: { reversalOfId: p2.id } });
    expect(reversal.amountPaise).toBe(-2500000n);
    expect(await fundBalance(zakatId)).toBe(balanceBefore - 1500000n);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: appId } })).status).toBe("PAYMENT_PENDING");

    // An uncleared payment is cancelled outright.
    ok(await pays.cancelPayment({ id: p1.id, reason: "reissue" }));
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p1.id } })).status).toBe("CANCELLED");
    expect(await fundBalance(zakatId)).toBe(balanceBefore);
  });

  it("blocks a payment that would overdraw the fund", async () => {
    const balance = await fundBalance(zakatId);
    await prisma.application.update({ where: { id: appId }, data: { approvedAmountPaise: balance + 100n } });
    const r = await pays.recordPayment({
      applicationId: appId, amountPaise: balance + 100n, mode: "NEFT", chequeNo: `UTR${stamp}`, paymentDate: toDateInput(new Date()),
      towards: "HOSPITAL_BILL", hospitalId, fundId: zakatId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/fund has .* left/);
    await prisma.application.update({ where: { id: appId }, data: { approvedAmountPaise: 4000000n } });
  });

  it("lets only one of two simultaneous full payments through", async () => {
    await as("ACCOUNTANT");
    const bankId = (await prisma.bank.findFirstOrThrow({ where: { isOwnAccount: true } })).id;
    const pay = (n: string) => pays.recordPayment({
      applicationId: appId, amountPaise: 4000000n, mode: "CHEQUE", chequeNo: `R${n}${stamp}`.slice(0, 12), bankId,
      paymentDate: toDateInput(new Date()), towards: "HOSPITAL_BILL", hospitalId, fundId: zakatId,
    });
    const results = await Promise.all([pay("1"), pay("2")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const paid = await prisma.payment.aggregate({ where: { applicationId: appId, status: { notIn: ["CANCELLED", "BOUNCED"] } }, _sum: { amountPaise: true } });
    expect(paid._sum.amountPaise).toBe(4000000n);
  });

  it("lets only the general secretary change the approved amount of a recorded case", async () => {
    await as("OPERATOR");
    const form = paper(`Approval Rule ${stamp}`, 300000n);
    const d = ok(await apps.saveApplication(form));
    await attachRequired(d.id);
    ok(await apps.submitApplication({ id: d.id, payment: null }));
    const a = await prisma.application.findUniqueOrThrow({ where: { id: d.id } });
    const raise = { ...form, id: d.id, applicant: { ...form.applicant, personId: a.applicantId }, case: { ...form.case, approvedAmountPaise: 400000n } };
    const r = await apps.saveApplication(raise);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Only the general secretary can change the approved amount/);
    expect((await prisma.application.findUniqueOrThrow({ where: { id: d.id } })).approvedAmountPaise).toBe(300000n);
    await as("GENERAL_SECRETARY");
    ok(await apps.saveApplication(raise));
    expect((await prisma.application.findUniqueOrThrow({ where: { id: d.id } })).approvedAmountPaise).toBe(400000n);
  });
});

describe("money in and running costs", () => {
  it("issues receipts in sequence and voids them on cancel", async () => {
    await as("ACCOUNTANT");
    const donor = ok(await dons.saveDonor({ name: `Test donor ${stamp}`, type: "INDIVIDUAL", isAnonymous: false }));
    const a = ok(await dons.saveDonation({ donorId: donor.id, amountPaise: 1000000n, donationDate: toDateInput(new Date()), mode: "CASH" }));
    const b = ok(await dons.saveDonation({ donorId: donor.id, amountPaise: 200000n, donationDate: toDateInput(new Date()), mode: "CASH" }));
    const n = (r: string) => Number(r.split("/").pop());
    expect(n(b.receiptNo)).toBe(n(a.receiptNo) + 1);
    const before = await fundBalance(zakatId);
    ok(await dons.cancelDonation({ id: b.id, reason: "entered twice" }));
    expect(await fundBalance(zakatId)).toBe(before - 200000n);
    const again = await dons.cancelDonation({ id: b.id, reason: "again" });
    expect(again.ok).toBe(false);
  });

  it("never charges running costs to Zakat", async () => {
    const r = await exps.createExpense({ category: "RENT", description: "Office rent", amountPaise: 100000n, expenseDate: toDateInput(new Date()), mode: "CASH" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No fund is available for expenses/);
  });

  it("refuses money actions to roles without them", async () => {
    await as("OPERATOR");
    const r = await dons.saveDonor({ name: "Nope", type: "INDIVIDUAL", isAnonymous: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/permission/);
  });
});

describe("fiscal years", () => {
  // Custom-dated years in 1970 so nothing real is touched; cleared with raw SQL (soft delete keeps codes).
  beforeAll(async () => {
    await prisma.$executeRaw`DELETE FROM "FiscalYear" WHERE code IN ('1970', '1970-71')`;
  });

  it("lets the super admin set a year's own dates, named from them", async () => {
    await as("SUPER_ADMIN");
    const y = ok(await fys.startFiscalYear({ password: "x", startsOn: "1970-01-01", lastDay: "1970-12-31" }));
    expect(y.code).toBe("1970");
    const overlap = await fys.startFiscalYear({ password: "x", startsOn: "1970-07-01", lastDay: "1971-06-30" });
    expect(overlap.ok).toBe(false);
    if (!overlap.ok) expect(overlap.error).toMatch(/overlap FY 1970/);

    await as("ACCOUNTANT");
    const donor = ok(await dons.saveDonor({ name: `Calendar FY donor ${stamp}`, type: "INDIVIDUAL", isAnonymous: false }));
    const d = ok(await dons.saveDonation({ donorId: donor.id, fundId: zakatId, amountPaise: 50000n, donationDate: "1970-06-15", mode: "CASH" }));
    expect(d.receiptNo).toMatch(/^R\/1970\//);

    // Shrinking the year would leave that donation outside it.
    await as("SUPER_ADMIN");
    const shrink = await fys.updateFiscalYearDates({ code: "1970", password: "x", startsOn: "1970-01-01", lastDay: "1970-03-31" });
    expect(shrink.ok).toBe(false);
    if (!shrink.ok) expect(shrink.error).toMatch(/\d+ donations? of FY 1970 would fall outside/);
    ok(await fys.updateFiscalYearDates({ code: "1970", password: "x", startsOn: "1970-01-01", lastDay: "1970-09-30" }));
    const row = await prisma.fiscalYear.findUniqueOrThrow({ where: { code: "1970" } });
    expect(row.endsOn.toISOString()).toBe("1970-09-30T18:30:00.000Z");
  });

  // A far-past year so closing it cannot disturb the other suites writing into the current year.
  const OLD = "1990-91";
  beforeAll(async () => {
    await prisma.fiscalYear.upsert({
      where: { code: OLD },
      create: { code: OLD, startsOn: new Date("1990-03-31T18:30:00Z"), endsOn: new Date("1991-03-31T18:30:00Z") },
      update: { status: "OPEN", closedAt: null, closedById: null },
    });
  });

  it("refuses entries in a year that has not been started", async () => {
    await as("ACCOUNTANT");
    const donor = ok(await dons.saveDonor({ name: `FY donor ${stamp}`, type: "INDIVIDUAL", isAnonymous: false }));
    const r = await dons.saveDonation({ donorId: donor.id, fundId: zakatId, amountPaise: 100000n, donationDate: "1985-06-01", mode: "CASH" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/No fiscal year covers 01 Jun 1985/);
  });

  it("lets the super admin close and reopen a year, and a closed year takes no entries", async () => {
    await as("SUPER_ADMIN");
    ok(await fys.closeFiscalYear({ code: OLD, password: "x", note: "Audited" }));
    expect((await prisma.fiscalYear.findUniqueOrThrow({ where: { code: OLD } })).status).toBe("CLOSED");

    await as("ACCOUNTANT");
    const donor = ok(await dons.saveDonor({ name: `Closed FY donor ${stamp}`, type: "INDIVIDUAL", isAnonymous: false }));
    const refused = await dons.saveDonation({ donorId: donor.id, fundId: zakatId, amountPaise: 100000n, donationDate: "1990-06-01", mode: "CASH" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/FY 1990-91 is closed/);
    // Only the super admin manages years.
    expect((await fys.reopenFiscalYear({ code: OLD, password: "x", reason: "Late receipt found" })).ok).toBe(false);

    await as("SUPER_ADMIN");
    ok(await fys.reopenFiscalYear({ code: OLD, password: "x", reason: "Late receipt found" }));
    await as("ACCOUNTANT");
    const d = ok(await dons.saveDonation({ donorId: donor.id, fundId: zakatId, amountPaise: 100000n, donationDate: "1990-06-01", mode: "CASH" }));
    expect(d.receiptNo).toMatch(/^R\/1990-91\//);
  });
});
