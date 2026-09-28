/* Times every page-level query against a large database. Not part of the app.
   Usage: DATABASE_URL=postgresql://.../mhf_perf npx tsx --conditions=react-server scripts/perf.ts */
import { prisma } from "../src/lib/db";
import type { ViewContext } from "../src/lib/redact";
import { getFiscalYear } from "../src/lib/fy";
import { getApplication, getApplicationHistory, listApplications } from "../src/lib/db/queries/applications";
import { getDashboard, listHospitals, diseaseRows } from "../src/lib/db/queries/analytics";
import { caseBreakdown } from "../src/lib/db/queries/breakdown";
import { getPerson, listPeople, searchPeople } from "../src/lib/db/queries/people";
import { listPayments } from "../src/lib/db/queries/payments";
import { listFunds } from "../src/lib/db/queries/funds";
import { listDonations, listDonors } from "../src/lib/db/queries/donations";
import { listAudit, shellCounts, globalSearch } from "../src/lib/db/queries/admin";
import { fyPeriod, runReport } from "../src/lib/db/queries/reports";

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
  const ctx: ViewContext = { userId: admin.id, name: admin.name, role: admin.role, meetingMode: false, globalMeetingMode: false, fy: process.env.FY ?? getFiscalYear() };
  const app = await prisma.application.findFirstOrThrow({ where: { status: "PAID" }, orderBy: { createdAt: "desc" } });
  const hospital = await prisma.hospital.findFirstOrThrow();

  const cases: [string, () => Promise<unknown>][] = [
    ["layout: shellCounts (every page)", () => shellCounts(ctx)],
    ["dashboard", () => getDashboard(ctx)],
    ["applications list", () => listApplications(ctx, { fy: ctx.fy })],
    ["applications list, all years", () => listApplications(ctx, {})],
    ["applications list, missing docs", () => listApplications(ctx, { pendingDocs: true })],
    ["applications list, repeat", () => listApplications(ctx, { repeat: true })],
    ["case detail", () => getApplication(ctx, app.id)],
    ["case history", () => getApplicationHistory(ctx, app.id, false)],
    ["patients", () => listPeople(ctx, { as: "patient" })],
    ["person page", () => getPerson(ctx, app.patientId)],
    ["person search", () => searchPeople(ctx, "Perf")],
    ["global search", () => globalSearch(ctx, "Perf")],
    ["payments", () => listPayments(ctx, { fy: ctx.fy })],
    ["funds", () => listFunds(ctx)],
    ["donations", () => listDonations(ctx, { fy: ctx.fy })],
    ["donors", () => listDonors(ctx, {})],
    ["hospitals", () => listHospitals(ctx, {})],
    ["hospital page", () => caseBreakdown(ctx, { hospitalId: hospital.id })],
    ["diseases", () => diseaseRows(ctx, {})],
    ["audit log", () => listAudit(ctx, {})],
    ["report: payments register", async () => runReport(ctx, "disbursements", await fyPeriod(ctx.fy))],
    ["report: annual pack", async () => runReport(ctx, "annual", await fyPeriod(ctx.fy))],
  ];
  for (const [, fn] of cases) await fn(); // warm the connection pool and plans
  const rows: [number, string][] = [];
  for (const [name, fn] of cases) {
    const t = performance.now();
    for (let i = 0; i < 3; i++) await fn();
    rows.push([(performance.now() - t) / 3, name]);
  }
  for (const [ms, name] of rows.sort((a, b) => b[0] - a[0])) console.log(`${ms.toFixed(0).padStart(6)} ms  ${name}`);
}

main().finally(() => prisma.$disconnect());
