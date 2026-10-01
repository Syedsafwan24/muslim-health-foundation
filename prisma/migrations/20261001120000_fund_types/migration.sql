-- Fund types are Zakat, General and Interest. Existing Sadaqah or Other funds become General.
ALTER TYPE "FundType" RENAME TO "FundType_old";
CREATE TYPE "FundType" AS ENUM ('ZAKAT', 'GENERAL', 'INTEREST');
ALTER TABLE "Fund" ALTER COLUMN "type" TYPE "FundType"
  USING (CASE WHEN "type"::text IN ('SADAQAH', 'OTHER') THEN 'GENERAL' ELSE "type"::text END)::"FundType";
DROP TYPE "FundType_old";
