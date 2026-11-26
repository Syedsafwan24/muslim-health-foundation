-- A case's file closes once a payment is recorded against it; only the super admin can reopen it.
ALTER TABLE "Application" ADD COLUMN "lockedAt" TIMESTAMP(3);
-- Per-user switch: this account cannot open applications, patients or applicants at all.
ALTER TABLE "User" ADD COLUMN "hideCases" BOOLEAN NOT NULL DEFAULT false;

-- Cases that already have a live payment are closed from now on.
UPDATE "Application" a SET "lockedAt" = NOW()
WHERE a."deletedAt" IS NULL AND EXISTS (
  SELECT 1 FROM "Payment" p
  WHERE p."applicationId" = a.id AND p."deletedAt" IS NULL AND p.status NOT IN ('CANCELLED', 'BOUNCED')
);
