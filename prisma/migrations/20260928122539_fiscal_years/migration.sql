-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "openedById" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeNote" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_code_key" ON "FiscalYear"("code");

-- Backfill: every fiscal year that already has records, plus the current one, starts OPEN so
-- existing data keeps working. The super admin closes past years from Settings.
WITH starts AS (
  SELECT CAST(substring("fiscalYear" FROM 1 FOR 4) AS INTEGER) AS y FROM "Application" WHERE "fiscalYear" ~ '^\d{4}-\d{2}$'
  UNION SELECT CASE WHEN EXTRACT(MONTH FROM l) >= 4 THEN EXTRACT(YEAR FROM l) ELSE EXTRACT(YEAR FROM l) - 1 END
    FROM (SELECT ("paymentDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata' AS l FROM "Payment") p
  UNION SELECT CASE WHEN EXTRACT(MONTH FROM l) >= 4 THEN EXTRACT(YEAR FROM l) ELSE EXTRACT(YEAR FROM l) - 1 END
    FROM (SELECT ("donationDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata' AS l FROM "Donation") d
  UNION SELECT CASE WHEN EXTRACT(MONTH FROM l) >= 4 THEN EXTRACT(YEAR FROM l) ELSE EXTRACT(YEAR FROM l) - 1 END
    FROM (SELECT ("expenseDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata' AS l FROM "Expense") e
  UNION SELECT CASE WHEN EXTRACT(MONTH FROM l) >= 4 THEN EXTRACT(YEAR FROM l) ELSE EXTRACT(YEAR FROM l) - 1 END
    FROM (SELECT (now() AT TIME ZONE 'Asia/Kolkata') AS l) n
)
INSERT INTO "FiscalYear" ("id", "code", "startsOn", "endsOn", "status")
SELECT
  'fy_' || y::int,
  y::int || '-' || lpad(((y::int + 1) % 100)::text, 2, '0'),
  (make_timestamp(y::int, 4, 1, 0, 0, 0) AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC',
  (make_timestamp(y::int + 1, 4, 1, 0, 0, 0) AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC',
  'OPEN'
FROM starts
WHERE y IS NOT NULL
ON CONFLICT ("code") DO NOTHING;
