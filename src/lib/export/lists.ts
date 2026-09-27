import "server-only";
import type { Capability } from "@/lib/auth/permissions";
import type { ViewContext } from "@/lib/redact";
import type { ReportTable } from "@/lib/db/queries/reports";

/**
 * "Export" on a list or detail page: the same filters as the page (its URL search params) go to
 * /api/export/list?name=<name>&format=pdf|xlsx. Each page registers one entry here; the route
 * checks `cap` and reports.export, renders PDF or Excel, and writes the audit row.
 * Rows must already be redacted for ctx (reuse the page's own query).
 */
export type ListExport = {
  cap: Capability;
  run: (ctx: ViewContext, sp: URLSearchParams) => Promise<{ title: string; subtitle?: string; tables: ReportTable[]; redacted: boolean } | null>;
};

export const LIST_EXPORTS: Record<string, () => Promise<ListExport>> = {
  hospital: () => import("./lists/breakdown").then((m) => m.hospitalExport),
  disease: () => import("./lists/breakdown").then((m) => m.diseaseExport),
  payments: () => import("./lists/money").then((m) => m.paymentsExport),
  donations: () => import("./lists/money").then((m) => m.donationsExport),
  donors: () => import("./lists/money").then((m) => m.donorsExport),
  expenses: () => import("./lists/money").then((m) => m.expensesExport),
  applications: () => import("./lists/applications").then((m) => m.applicationsExport),
  hospitals: () => import("./lists/masters").then((m) => m.hospitalsExport),
  diseases: () => import("./lists/masters").then((m) => m.diseasesExport),
  patients: () => import("./lists/people").then((m) => m.patientsExport),
  applicants: () => import("./lists/people").then((m) => m.applicantsExport),
};
