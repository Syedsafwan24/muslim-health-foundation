// The tests required by docs/03-privacy-and-access.md §9. They run against a freshly seeded
// test database (see test/setup-db.ts). Next's request APIs are mocked; a "forged" request
// is simulated by making every cookie and header claim that masking is off.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";

const session = { user: { id: "", role: "SUPER_ADMIN" as Role } };
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => session),
  verifyPassword: vi.fn(async () => true),
  signOut: vi.fn(),
}));
vi.mock("next/headers", () => {
  const forged = { get: (k: string) => ({ name: k, value: k === "fy" ? "2026-27" : "off" }) };
  return {
    cookies: async () => forged,
    headers: async () => new Map([["x-meeting-mode", "off"], ["user-agent", "vitest"], ["x-forwarded-for", "127.0.0.1"]]),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => { throw new Error(`redirect ${u}`); },
  forbidden: () => { throw new Error("forbidden"); },
  notFound: () => { throw new Error("not found"); },
}));

const { prisma } = await import("@/lib/db");
const { redactPerson, scrubNames } = await import("@/lib/redact");
const { getViewContext, resolveMeetingMode } = await import("@/lib/auth/context");
const { listApplications, getApplication, getApplicationHistory } = await import("@/lib/db/queries/applications");
const { listPeople, getPerson, searchPeople } = await import("@/lib/db/queries/people");
const { globalSearch } = await import("@/lib/db/queries/admin");
const { caseBreakdown } = await import("@/lib/db/queries/breakdown");
const { listPayments } = await import("@/lib/db/queries/payments");
const { authorizeFileAccess } = await import("@/lib/db/queries/shared");
const { revealIdentity } = await import("@/app/(app)/applications/actions");
const { setMeetingMode } = await import("@/app/(app)/settings/actions");

/** Identity fields that must never appear in a redacted payload. */
const FORBIDDEN_KEYS = ["fullName", "fatherName", "husbandName", "mobile", "addressLine", "religion", "idNumberLast4"];
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

let originalProblem: string | null = null;
let ids: { admin: string; gensec: string; app: string; appWithName: string; patient: { id: string; fullName: string; fatherName: string | null; mobile: string | null }; hospital: string; disease: string; committee: string; govtId: string };

async function setGlobal(on: boolean) {
  await prisma.setting.upsert({ where: { key: "meetingMode.global" }, create: { key: "meetingMode.global", value: on }, update: { value: on } });
}
const asUser = (id: string, role: Role) => { session.user.id = id; session.user.role = role; };

beforeAll(async () => {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
  const gensec = await prisma.user.findFirstOrThrow({ where: { role: "GENERAL_SECRETARY" } });
  const committee = await prisma.user.findFirstOrThrow({ where: { role: "COMMITTEE_MEMBER" } });
  const disease = await prisma.disease.findFirstOrThrow();
  const app = await prisma.application.findFirstOrThrow({
    where: { status: { in: ["APPROVED", "PAYMENT_PENDING"] }, attachments: { some: { type: "GOVT_ID" } } },
    include: { patient: true, attachments: true },
  });
  // A case whose free text names the patient, for the scrubNames test (restored afterwards).
  originalProblem = app.majorProblem;
  const named = await prisma.application.update({
    where: { id: app.id },
    data: { majorProblem: `${app.patient.fullName} needs dialysis twice a week. ${app.patient.fullName.split(" ")[0]} cannot work.` },
  });
  ids = {
    admin: admin.id, gensec: gensec.id, app: app.id, appWithName: named.id,
    patient: { id: app.patient.id, fullName: app.patient.fullName, fatherName: app.patient.fatherName, mobile: app.patient.mobile },
    hospital: app.hospitalId!, disease: disease.id, committee: committee.id,
    govtId: app.attachments.find((a) => a.type === "GOVT_ID")!.id,
  };
});

beforeEach(async () => {
  await setGlobal(false);
  await prisma.revealGrant.deleteMany({ where: { applicationId: ids.app } }); // test hygiene only
  asUser(ids.admin, "SUPER_ADMIN");
});

afterAll(async () => {
  await setGlobal(false);
  await prisma.application.update({ where: { id: ids.appWithName }, data: { majorProblem: originalProblem } });
  await prisma.revealGrant.deleteMany({ where: { applicationId: ids.app } });
  await prisma.$disconnect();
});

describe("1. redactPerson", () => {
  it("drops every hidden field", async () => {
    const p = await prisma.person.findFirstOrThrow({ where: { id: ids.patient.id }, include: { area: true } });
    const v = redactPerson(p, { meetingMode: true });
    expect(Object.keys(v).sort()).toMatchInlineSnapshot(`
      [
        "ageBand",
        "displayName",
        "gender",
        "id",
        "isRedacted",
        "maritalStatus",
        "personCode",
        "watchFlag",
      ]
    `);
    for (const k of [...FORBIDDEN_KEYS, "altMobile", "areaName", "pincode", "dateOfBirth", "age", "watchNote", "idType"]) expect(v).not.toHaveProperty(k);
  });
});

describe("2. every list and detail read in meeting mode", () => {
  it("contains no identity field in the serialised JSON", async () => {
    await setGlobal(true);
    const ctx = await getViewContext();
    expect(ctx.meetingMode).toBe(true);
    const payloads = await Promise.all([
      listApplications(ctx, { fy: undefined }),
      getApplication(ctx, ids.app),
      getApplicationHistory(ctx, ids.app, true),
      listPeople(ctx, { as: "patient" }),
      listPeople(ctx, { as: "applicant" }),
      getPerson(ctx, ids.patient.id),
      searchPeople(ctx, ids.patient.fullName),
      globalSearch(ctx, ids.patient.fullName),
      caseBreakdown(ctx, { hospitalId: ids.hospital }),
      caseBreakdown(ctx, { diseaseId: ids.disease }),
      listPayments(ctx, {}),
    ]);
    for (const p of payloads) {
      const s = json(p);
      for (const k of FORBIDDEN_KEYS) expect(s).not.toContain(`"${k}"`);
      expect(s).not.toContain(ids.patient.fullName);
      if (ids.patient.mobile) expect(s).not.toContain(ids.patient.mobile);
      if (ids.patient.fatherName) expect(s).not.toContain(ids.patient.fatherName);
    }
  });
});

describe("3. nothing from the request can turn masking off", () => {
  it("returns redacted data for a forged request while the global switch is on", async () => {
    await setGlobal(true);
    // Every cookie reads "off" and a header claims x-meeting-mode: off (see the mocks above).
    const ctx = await getViewContext();
    expect(ctx.meetingMode).toBe(true);
    const a = await getApplication(ctx, ids.app);
    expect(a!.masked).toBe(true);
    expect(json(a)).not.toContain(ids.patient.fullName);
  });
});

describe("4. signed URLs under meeting mode", () => {
  it("rejects an identity document and issues no URL", async () => {
    await setGlobal(true);
    const ctx = await getViewContext();
    const before = await prisma.auditLog.count({ where: { entityId: ids.govtId } });
    const r = await authorizeFileAccess(ctx, ids.govtId, false);
    expect(r).toEqual({ ok: false, status: 403 });
    expect(json(r)).not.toContain("applications/");
    expect(await prisma.auditLog.count({ where: { entityId: ids.govtId } })).toBe(before);
  });
});

describe("5. reveal", () => {
  it("is rejected without a reason", async () => {
    const before = await prisma.auditLog.count({ where: { action: "REVEAL_IDENTITY", entityId: ids.app } });
    const r = await revealIdentity({ applicationId: ids.app, reason: "", password: "x" });
    expect(r.ok).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "REVEAL_IDENTITY", entityId: ids.app } })).toBe(before);
    expect(await prisma.revealGrant.count({ where: { applicationId: ids.app } })).toBe(0);
  });
  it("with a reason writes exactly one audit row and a grant that unmasks only this case", async () => {
    await setGlobal(true);
    const before = await prisma.auditLog.count({ where: { action: "REVEAL_IDENTITY", entityId: ids.app } });
    const r = await revealIdentity({ applicationId: ids.app, reason: "verifying a duplicate claim", password: "correct" });
    expect(r.ok).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "REVEAL_IDENTITY", entityId: ids.app } })).toBe(before + 1);
    const ctx = await getViewContext();
    expect((await getApplication(ctx, ids.app))!.masked).toBe(false);
    const other = await prisma.application.findFirstOrThrow({ where: { id: { not: ids.app }, status: { not: "DRAFT" } } });
    expect((await getApplication(ctx, other.id))!.masked).toBe(true);
  });
});

describe("6. per-account pin", () => {
  it("hides identities for a pinned account while the switch is off", async () => {
    expect(resolveMeetingMode({ global: false, forceMeetingMode: true })).toBe(true);
    await prisma.user.update({ where: { id: ids.committee }, data: { forceMeetingMode: true } });
    asUser(ids.committee, "COMMITTEE_MEMBER");
    const ctx = await getViewContext();
    expect(ctx.meetingMode).toBe(true);
    expect(json(await getApplication(ctx, ids.app))).not.toContain(ids.patient.fullName);
  });
  it("shows identities to an unpinned account while the switch is off", async () => {
    expect(resolveMeetingMode({ global: false, forceMeetingMode: false })).toBe(false);
    const ctx = await getViewContext();
    expect(ctx.meetingMode).toBe(false);
    expect(json(await getApplication(ctx, ids.app))).toContain(ids.patient.fullName);
  });
});

describe("7. scrubNames", () => {
  it("removes the patient's name from majorProblem in the redacted response", async () => {
    await setGlobal(true);
    const ctx = await getViewContext();
    const a = await getApplication(ctx, ids.appWithName);
    expect(a!.majorProblem).not.toContain(ids.patient.fullName.split(" ")[0]);
    expect(a!.majorProblem).toContain("[name hidden]");
    expect(scrubNames("Ahmed Ali needs surgery; Ali is the only earner", ["Ahmed Ali"])).toBe("[name hidden] needs surgery; [name hidden] is the only earner");
  });
});

describe("8. reveal by the general secretary", () => {
  it("is rejected and writes no grant", async () => {
    asUser(ids.gensec, "GENERAL_SECRETARY");
    await setGlobal(true);
    const r = await revealIdentity({ applicationId: ids.app, reason: "verifying a duplicate claim", password: "correct" });
    expect(r.ok).toBe(false);
    expect(await prisma.revealGrant.count({ where: { applicationId: ids.app } })).toBe(0);
  });
});

describe("9. the global switch", () => {
  it("writes exactly one MEETING_MODE_TOGGLE audit row per toggle", async () => {
    const before = await prisma.auditLog.count({ where: { action: "MEETING_MODE_TOGGLE" } });
    expect((await setMeetingMode({ on: true })).ok).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "MEETING_MODE_TOGGLE" } })).toBe(before + 1);
    expect((await setMeetingMode({ on: false })).ok).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "MEETING_MODE_TOGGLE" } })).toBe(before + 2);
  });
  it("cannot be flipped by anyone but the super admin", async () => {
    asUser(ids.gensec, "GENERAL_SECRETARY");
    const before = await prisma.auditLog.count({ where: { action: "MEETING_MODE_TOGGLE" } });
    expect((await setMeetingMode({ on: true })).ok).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "MEETING_MODE_TOGGLE" } })).toBe(before);
  });
});
