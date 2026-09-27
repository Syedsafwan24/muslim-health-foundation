import type { ApplicationStatus } from "@prisma/client";

// Case lifecycle. The trust approves cases outside the app, so a case is entered already
// approved. DRAFT is only the clerk's unfinished entry; payment states follow the payments.
// The review states still in the enum (SUBMITTED … REJECTED) are unused dead ends, so old rows
// cannot move anywhere unexpected. Any transition not in this map throws.
export const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: ["APPROVED"],
  APPROVED: ["PAYMENT_PENDING", "PAID", "CLOSED"],
  PARTIALLY_APPROVED: ["PAYMENT_PENDING", "PAID", "CLOSED"], // legacy rows only
  // PAID → PAYMENT_PENDING happens when a payment is cancelled or bounces.
  PAYMENT_PENDING: ["PAID", "CLOSED"],
  PAID: ["CLOSED", "PAYMENT_PENDING"],
  CLOSED: [], // reopening is a separate SUPER_ADMIN action
  SUBMITTED: [], UNDER_VERIFICATION: [], ON_HOLD: [], COMMITTEE_REVIEW: [], DEFERRED: [], REJECTED: [],
};

export class TransitionError extends Error {}

export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new TransitionError(`A case cannot move from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}.`);
  }
}

export const canTransition = (from: ApplicationStatus, to: ApplicationStatus) => TRANSITIONS[from].includes(to);

/** Case details may be edited until the money has gone out. */
export const EDITABLE = (s: ApplicationStatus) => s !== "PAID" && s !== "CLOSED";
/** Payments may be recorded against these. */
export const PAYABLE: ApplicationStatus[] = ["APPROVED", "PARTIALLY_APPROVED", "PAYMENT_PENDING"];
/** Open = not yet finished. */
export const OPEN_STATUSES: ApplicationStatus[] = ["DRAFT", "APPROVED", "PARTIALLY_APPROVED", "PAYMENT_PENDING"];
/** Statuses a clerk can filter by. The unused review states are left out. */
export const LIVE_STATUSES: ApplicationStatus[] = ["DRAFT", "APPROVED", "PAYMENT_PENDING", "PAID", "CLOSED"];

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_VERIFICATION: "Under verification",
  ON_HOLD: "On hold",
  COMMITTEE_REVIEW: "Committee review",
  APPROVED: "Approved",
  PARTIALLY_APPROVED: "Partially approved",
  REJECTED: "Rejected",
  DEFERRED: "Deferred",
  PAYMENT_PENDING: "Payment pending",
  PAID: "Paid",
  CLOSED: "Closed",
};
