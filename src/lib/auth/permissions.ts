import type { Role } from "@prisma/client";

// The single capability map. Components and actions ask `can(ctx, cap)`; nothing checks a role
// name inline. Source: docs/03-privacy-and-access.md §7.
const SA: Role = "SUPER_ADMIN";
const GS: Role = "GENERAL_SECRETARY";
const CM: Role = "COMMITTEE_MEMBER";
const OP: Role = "OPERATOR";
const AC: Role = "ACCOUNTANT";
const VW: Role = "VIEWER";

export const CAPABILITIES = {
  "applications.read": [SA, GS, CM, OP, AC, VW],
  "applications.write": [SA, GS, OP],
  "applications.decide": [SA, GS],
  "people.read": [SA, GS, CM, OP, AC, VW],
  "people.write": [SA, GS, OP],
  "people.merge": [SA, GS],
  "attachments.read": [SA, GS, CM, OP],
  "attachments.readFinancial": [SA, GS, OP, AC],
  "attachments.write": [SA, GS, OP],
  "payments.read": [SA, GS, CM, AC, VW],
  "payments.write": [SA, GS, AC],
  "donations.read": [SA, GS, AC, VW],
  "donations.write": [SA, AC],
  "donors.seeAnonymous": [SA, AC],
  "expenses.read": [SA, GS, AC, VW],
  "expenses.write": [SA, AC],
  "funds.read": [SA, GS, AC],
  "funds.write": [SA, AC],
  "hospitals.write": [SA, GS, OP],
  "masters.read": [SA, GS, CM, OP, AC, VW],
  "masters.write": [SA],
  "reports.operational": [SA, GS, OP, VW],
  "reports.financial": [SA, GS, AC, VW],
  "reports.export": [SA, GS, OP, AC],
  "reports.exportUnredacted": [SA],
  "settings.read": [SA, GS],
  "settings.write": [SA],
  "users.manage": [SA],
  "audit.read": [SA, GS],
  "audit.export": [SA],
  "identity.reveal": [SA],
  "meetingMode.toggle": [SA],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export class ForbiddenError extends Error {
  constructor() {
    super("You do not have permission to do that.");
  }
}

export function can(ctx: { role: Role }, cap: Capability): boolean {
  return (CAPABILITIES[cap] as readonly Role[]).includes(ctx.role);
}

export function assertPermission(ctx: { role: Role }, cap: Capability): void {
  if (!can(ctx, cap)) throw new ForbiddenError();
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  GENERAL_SECRETARY: "General secretary",
  COMMITTEE_MEMBER: "Committee member",
  OPERATOR: "Operator",
  ACCOUNTANT: "Accountant",
  VIEWER: "Viewer",
};
