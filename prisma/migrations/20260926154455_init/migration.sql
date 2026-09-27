-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'GENERAL_SECRETARY', 'COMMITTEE_MEMBER', 'OPERATOR', 'ACCOUNTANT', 'VIEWER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT', 'PAY', 'CANCEL_PAYMENT', 'REVEAL_IDENTITY', 'FILE_VIEW', 'FILE_DOWNLOAD', 'EXPORT', 'SETTING_CHANGE', 'MEETING_MODE_TOGGLE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('MARRIED', 'UNMARRIED', 'WIDOW', 'WIDOWER', 'DIVORCED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "IdType" AS ENUM ('AADHAAR', 'VOTER_ID', 'PAN', 'RATION_CARD', 'PASSPORT', 'DRIVING_LICENCE', 'OTHER', 'NONE');

-- CreateEnum
CREATE TYPE "HospitalType" AS ENUM ('GOVERNMENT', 'PRIVATE', 'TRUST', 'CLINIC', 'DIAGNOSTIC', 'PHARMACY', 'OTHER');

-- CreateEnum
CREATE TYPE "FundType" AS ENUM ('ZAKAT', 'SADAQAH', 'GENERAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ZakatCategory" AS ENUM ('FAQIR', 'MISKEEN', 'GHARIM', 'IBN_SABIL', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION', 'ON_HOLD', 'COMMITTEE_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'DEFERRED', 'PAYMENT_PENDING', 'PAID', 'CLOSED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('ROUTINE', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "PatientRelation" AS ENUM ('SELF', 'SPOUSE', 'SON', 'DAUGHTER', 'FATHER', 'MOTHER', 'BROTHER', 'SISTER', 'GRANDPARENT', 'GRANDCHILD', 'RELATIVE', 'NEIGHBOUR', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CHEQUE', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'CASH', 'DD');

-- CreateEnum
CREATE TYPE "PaymentTowards" AS ENUM ('HOSPITAL_BILL', 'MEDICINES', 'INVESTIGATION', 'SURGERY', 'IMPLANT', 'TRAVEL', 'APPLICANT_DIRECT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'ISSUED', 'CLEARED', 'BOUNCED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'SALARY', 'UTILITIES', 'STATIONERY', 'TRANSPORT', 'EVENT', 'MAINTENANCE', 'BANK_CHARGES', 'MISC');

-- CreateEnum
CREATE TYPE "DonorType" AS ENUM ('INDIVIDUAL', 'BUSINESS', 'TRUST', 'GOVERNMENT', 'ANONYMOUS');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('GOVT_ID', 'HOSPITAL_BILL', 'HOSPITAL_LETTER', 'MHF_APPLICATION_FORM', 'AUTHORISATION_FORM', 'DISCHARGE_SUMMARY', 'PRESCRIPTION', 'LAB_REPORT', 'CHEQUE_COPY', 'RECEIPT', 'DONATION_PROOF', 'EXPENSE_BILL', 'PHOTO', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "forceMeetingMode" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "personCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "fatherName" TEXT,
    "husbandName" TEXT,
    "gender" "Gender",
    "dateOfBirth" TIMESTAMP(3),
    "ageYears" INTEGER,
    "ageRecordedAt" TIMESTAMP(3),
    "maritalStatus" "MaritalStatus" NOT NULL DEFAULT 'UNKNOWN',
    "religion" TEXT,
    "mobile" TEXT,
    "altMobile" TEXT,
    "addressLine" TEXT,
    "areaId" TEXT,
    "city" TEXT DEFAULT 'Bhatkal',
    "pincode" TEXT,
    "idType" "IdType" NOT NULL DEFAULT 'NONE',
    "idNumberEnc" TEXT,
    "idNumberLast4" TEXT,
    "isDeceased" BOOLEAN NOT NULL DEFAULT false,
    "deceasedAt" TIMESTAMP(3),
    "watchFlag" BOOLEAN NOT NULL DEFAULT false,
    "watchNote" TEXT,
    "identityHash" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taluk" TEXT DEFAULT 'Bhatkal',
    "district" TEXT DEFAULT 'Uttara Kannada',
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HospitalType" NOT NULL DEFAULT 'PRIVATE',
    "addressLine" TEXT,
    "city" TEXT,
    "state" TEXT DEFAULT 'Karnataka',
    "phone" TEXT,
    "contactPerson" TEXT,
    "contactPhone" TEXT,
    "email" TEXT,
    "isEmpanelled" BOOLEAN NOT NULL DEFAULT false,
    "discountNote" TEXT,
    "bankName" TEXT,
    "bankAccountLast4" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiseaseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorToken" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DiseaseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disease" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isChronic" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Disease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch" TEXT,
    "accountLast4" TEXT,
    "isOwnAccount" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FundType" NOT NULL,
    "isRestricted" BOOLEAN NOT NULL DEFAULT false,
    "allowsExpenses" BOOLEAN NOT NULL DEFAULT true,
    "openingBalancePaise" BIGINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "caseNo" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "serial" INTEGER NOT NULL,
    "applicationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "patientIsApplicant" BOOLEAN NOT NULL DEFAULT false,
    "relation" "PatientRelation" NOT NULL DEFAULT 'SELF',
    "dependentCount" INTEGER,
    "introducedByName" TEXT,
    "introducedByPhone" TEXT,
    "attendingDoctor" TEXT,
    "hospitalId" TEXT,
    "diseaseId" TEXT,
    "majorProblem" TEXT,
    "approxExpensePaise" BIGINT,
    "requestedAmountPaise" BIGINT,
    "admissionDate" TIMESTAMP(3),
    "dischargeDate" TIMESTAMP(3),
    "zakatCategory" "ZakatCategory",
    "monthlyIncomePaise" BIGINT,
    "dependentsSupported" INTEGER,
    "ownsHouse" BOOLEAN,
    "ownsAgriLand" BOOLEAN,
    "savingsOrGoldNote" TEXT,
    "existingDebtPaise" BIGINT,
    "eligibilityNote" TEXT,
    "eligibilityVerifiedById" TEXT,
    "eligibilityVerifiedAt" TIMESTAMP(3),
    "authorisationReceived" BOOLEAN NOT NULL DEFAULT false,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "Priority" NOT NULL DEFAULT 'ROUTINE',
    "approvedAmountPaise" BIGINT,
    "decisionNote" TEXT,
    "rejectionReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "meetingId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationStatusHistory" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "note" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitteeMeeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "venue" TEXT,
    "attendees" TEXT,
    "minutes" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CommitteeMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'CHEQUE',
    "chequeNo" TEXT,
    "bankId" TEXT,
    "referenceNo" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "towards" "PaymentTowards" NOT NULL DEFAULT 'HOSPITAL_BILL',
    "payeeType" TEXT NOT NULL DEFAULT 'HOSPITAL',
    "hospitalId" TEXT,
    "payeeName" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "clearedAt" TIMESTAMP(3),
    "bouncedReason" TEXT,
    "reversalOfId" TEXT,
    "remark" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "fundId" TEXT NOT NULL,
    "paidTo" TEXT,
    "mode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "referenceNo" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donor" (
    "id" TEXT NOT NULL,
    "donorCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DonorType" NOT NULL DEFAULT 'INDIVIDUAL',
    "phone" TEXT,
    "email" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'India',
    "panLast4" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Donor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "donationDate" TIMESTAMP(3) NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "bankId" TEXT,
    "referenceNo" TEXT,
    "chequeNo" TEXT,
    "purposeNote" TEXT,
    "earmarkApplicationId" TEXT,
    "isReceiptIssued" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "label" TEXT,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "pageCount" INTEGER,
    "containsIdentity" BOOLEAN NOT NULL DEFAULT true,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "applicationId" TEXT,
    "personId" TEXT,
    "paymentId" TEXT,
    "donationId" TEXT,
    "expenseId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevealGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevealGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Person_personCode_key" ON "Person"("personCode");

-- CreateIndex
CREATE INDEX "Person_fullName_idx" ON "Person"("fullName");

-- CreateIndex
CREATE INDEX "Person_identityHash_idx" ON "Person"("identityHash");

-- CreateIndex
CREATE INDEX "Person_mobile_idx" ON "Person"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "Area_name_key" ON "Area"("name");

-- CreateIndex
CREATE INDEX "Hospital_name_idx" ON "Hospital"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DiseaseCategory_name_key" ON "DiseaseCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Disease_categoryId_name_key" ON "Disease"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Bank_name_key" ON "Bank"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Fund_name_key" ON "Fund"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Application_caseNo_key" ON "Application"("caseNo");

-- CreateIndex
CREATE INDEX "Application_status_applicationDate_idx" ON "Application"("status", "applicationDate");

-- CreateIndex
CREATE INDEX "Application_fiscalYear_idx" ON "Application"("fiscalYear");

-- CreateIndex
CREATE INDEX "Application_hospitalId_idx" ON "Application"("hospitalId");

-- CreateIndex
CREATE INDEX "Application_diseaseId_idx" ON "Application"("diseaseId");

-- CreateIndex
CREATE INDEX "ApplicationStatusHistory_applicationId_changedAt_idx" ON "ApplicationStatusHistory"("applicationId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_voucherNo_key" ON "Payment"("voucherNo");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversalOfId_key" ON "Payment"("reversalOfId");

-- CreateIndex
CREATE INDEX "Payment_paymentDate_idx" ON "Payment"("paymentDate");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_hospitalId_idx" ON "Payment"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_voucherNo_key" ON "Expense"("voucherNo");

-- CreateIndex
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Donor_donorCode_key" ON "Donor"("donorCode");

-- CreateIndex
CREATE INDEX "Donor_name_idx" ON "Donor"("name");

-- CreateIndex
CREATE INDEX "Donor_phone_idx" ON "Donor"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Donation_receiptNo_key" ON "Donation"("receiptNo");

-- CreateIndex
CREATE INDEX "Donation_donationDate_idx" ON "Donation"("donationDate");

-- CreateIndex
CREATE INDEX "Donation_donorId_idx" ON "Donation"("donorId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_applicationId_type_idx" ON "Attachment"("applicationId", "type");

-- CreateIndex
CREATE INDEX "RevealGrant_userId_applicationId_expiresAt_idx" ON "RevealGrant"("userId", "applicationId", "expiresAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disease" ADD CONSTRAINT "Disease_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DiseaseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_diseaseId_fkey" FOREIGN KEY ("diseaseId") REFERENCES "Disease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "CommitteeMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStatusHistory" ADD CONSTRAINT "ApplicationStatusHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "Donor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevealGrant" ADD CONSTRAINT "RevealGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
