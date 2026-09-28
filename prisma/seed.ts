/* Seed: masters, one user per role, and demo cases across every status.
   Run with `pnpm db:seed`. Idempotent only on an empty database — use `pnpm db:reset`. */
import { PrismaClient, type ApplicationStatus, type AttachmentType, type Prisma } from "@prisma/client";
import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import bcrypt from "bcryptjs";
import { identityHash } from "../src/lib/crypto";
import { fromZonedTime } from "date-fns-tz";

const prisma = new PrismaClient();
const TZ = "Asia/Kolkata";

// Deterministic PRNG so every seed produces the same demo.
let s = 20260926;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const rupees = (n: number) => BigInt(n) * 100n;
const ist = (y: number, m: number, d: number) => fromZonedTime(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T10:00:00`, TZ);
const fyOf = (d: Date) => {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};
const pad = (n: number, w: number) => String(n).padStart(w, "0");

const DISEASES: Record<string, { color: string; items: [string, boolean][] }> = {
  Cardiac: { color: "chart-1", items: [["Coronary artery disease", true], ["Valve replacement", false], ["Angioplasty", false], ["Heart failure", true], ["Congenital heart defect", false], ["Pacemaker implantation", false]] },
  Renal: { color: "chart-2", items: [["Dialysis", true], ["Kidney transplant", false], ["Chronic kidney disease", true], ["Kidney stones", false], ["Acute kidney injury", false]] },
  Oncology: { color: "chart-3", items: [["Breast cancer", true], ["Oral cancer", true], ["Blood cancer", true], ["Chemotherapy", true], ["Radiotherapy", true], ["Cervical cancer", true]] },
  Maternity: { color: "chart-4", items: [["Caesarean delivery", false], ["Normal delivery", false], ["High-risk pregnancy", false], ["Neonatal ICU", false]] },
  Trauma: { color: "chart-5", items: [["Road accident", false], ["Fracture", false], ["Head injury", false], ["Burns", false], ["Fall from height", false]] },
  Neurology: { color: "chart-6", items: [["Stroke", false], ["Epilepsy", true], ["Brain tumour", false], ["Spinal surgery", false], ["Parkinson's disease", true]] },
  Orthopaedic: { color: "chart-7", items: [["Knee replacement", false], ["Hip replacement", false], ["Spine fixation", false], ["Arthroscopy", false]] },
  Respiratory: { color: "chart-8", items: [["Tuberculosis", true], ["Asthma", true], ["Pneumonia", false], ["COPD", true], ["Lung infection", false]] },
  Gastro: { color: "chart-1", items: [["Liver cirrhosis", true], ["Gall bladder surgery", false], ["Appendicitis", false], ["Hernia repair", false], ["Pancreatitis", false]] },
  Ophthalmology: { color: "chart-2", items: [["Cataract surgery", false], ["Retinal detachment", false], ["Glaucoma", true], ["Corneal transplant", false]] },
  Paediatric: { color: "chart-3", items: [["Thalassemia", true], ["Premature birth care", false], ["Childhood leukaemia", true], ["Cleft lip surgery", false], ["Hole in the heart", false]] },
  "Diabetes & endocrine": { color: "chart-4", items: [["Diabetic foot", true], ["Insulin therapy", true], ["Thyroid surgery", false], ["Amputation", false], ["Diabetic kidney disease", true]] },
};

// Demo list — the client will supply the real area/mohalla list (open question 10).
const AREAS = [
  "Tenginagundi", "Jali", "Muglihonda", "Mundalli", "Sultan Street", "Nawayath Colony", "Madina Colony",
  "Shirali", "Murdeshwar", "Manki", "Hebale", "Jamia Abad", "Kidwai Road", "Bunder Road", "Chowthni",
  "Sagar Road", "Moodbhatkal", "Venkatapur", "Mawin Kurve", "Muttalli",
];

const HOSPITALS = [
  { name: "Taluk General Hospital", type: "GOVERNMENT", city: "Bhatkal", isEmpanelled: true },
  { name: "Bhatkal Community Hospital", type: "TRUST", city: "Bhatkal", isEmpanelled: true },
  { name: "KMC Hospital", type: "PRIVATE", city: "Mangalore", isEmpanelled: true },
  { name: "Father Muller Medical College Hospital", type: "TRUST", city: "Mangalore", isEmpanelled: true },
  { name: "A.J. Hospital", type: "PRIVATE", city: "Mangalore", isEmpanelled: false },
  { name: "Yenepoya Medical College Hospital", type: "PRIVATE", city: "Mangalore", isEmpanelled: true },
  { name: "Wenlock District Hospital", type: "GOVERNMENT", city: "Mangalore", isEmpanelled: false },
  { name: "Kasturba Hospital", type: "PRIVATE", city: "Manipal", isEmpanelled: true },
  { name: "KIMS Hospital", type: "GOVERNMENT", city: "Hubli", isEmpanelled: false },
  { name: "SDM Hospital", type: "TRUST", city: "Dharwad", isEmpanelled: false },
  { name: "City Diagnostic Centre", type: "DIAGNOSTIC", city: "Bhatkal", isEmpanelled: false },
  { name: "Al-Shifa Pharmacy", type: "PHARMACY", city: "Bhatkal", isEmpanelled: true },
] as const;

const MALE = ["Mohammed", "Abdul Rahman", "Ismail", "Ibrahim", "Yusuf", "Abdullah", "Hasan", "Ahmed", "Sayeed", "Irfan", "Mujahid", "Zubair", "Tauseef", "Anwar", "Khalid", "Faisal", "Imran", "Nadeem"];
const FEMALE = ["Fathima", "Ayesha", "Zainab", "Khadija", "Maryam", "Safiya", "Rukhsana", "Nasreen", "Shabana", "Hajira", "Amina", "Rizwana", "Sumayya", "Tahera"];
const SURNAMES = ["Kola", "Shabandri", "Mohtesham", "Damda", "Kazia", "Rukhnuddin", "Gawai", "Akrami", "Motiya", "Khalifa", "Jukaku", "Barmawar", "Qazi", "Shingeri", "Sheikh", "Chida", "Siddiqa", "Haji Fakih"];

const SAMPLE_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj " +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj " +
    "4 0 obj<</Length 58>>stream\nBT /F1 18 Tf 72 760 Td (MHF demo document - not a real record) Tj ET\nendstream endobj " +
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

async function storage() {
  if (!process.env.S3_ENDPOINT) return null;
  const c = new S3Client({
    endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION ?? "auto", forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  const Bucket = process.env.S3_BUCKET ?? "mhf-private";
  try {
    try { await c.send(new HeadBucketCommand({ Bucket })); } catch { await c.send(new CreateBucketCommand({ Bucket })); }
    return async (key: string) => { await c.send(new PutObjectCommand({ Bucket, Key: key, Body: SAMPLE_PDF, ContentType: "application/pdf" })); };
  } catch {
    console.warn("Object storage not reachable — seeding attachments without files.");
    return null;
  }
}

async function main() {
  if (await prisma.user.count()) {
    console.log("Database already seeded. Run `pnpm db:reset` to start over.");
    return;
  }
  // The demo password is public (README). Production must supply its own, and every seeded
  // account is forced to choose a personal password at first sign-in.
  // Setting SEED_ADMIN_PASSWORD alone also switches this on, in case NODE_ENV is unset on the server.
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (process.env.NODE_ENV === "production" && !seedPassword) {
    throw new Error("Refusing to seed demo users in production without SEED_ADMIN_PASSWORD.");
  }
  if (seedPassword !== undefined && seedPassword.length < 10) throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters.");
  const production = seedPassword !== undefined;
  const passwordHash = await bcrypt.hash(seedPassword ?? "Mhf@2026!", 10);
  const mustChangePassword = production;

  // ── users: one per role. Committee and viewer are pinned to Meeting Mode (docs/03 §4).
  const users = await Promise.all(
    ([
      ["Imran Kola", "admin@mhf.local", "SUPER_ADMIN", false],
      ["Abdul Qadir Shabandri", "gensec@mhf.local", "GENERAL_SECRETARY", false],
      ["Yusuf Mohtesham", "committee@mhf.local", "COMMITTEE_MEMBER", true],
      ["Sana Damda", "operator@mhf.local", "OPERATOR", false],
      ["Riyaz Kazia", "accounts@mhf.local", "ACCOUNTANT", false],
      ["Audit Visitor", "viewer@mhf.local", "VIEWER", true],
    ] as const).map(([name, email, role, forceMeetingMode]) =>
      prisma.user.create({ data: { name, email, role, forceMeetingMode, passwordHash, mustChangePassword } }),
    ),
  );
  const [admin, gensec, , operator, accountant] = users;

  // ── funds: Zakat (aid only) and General (aid and office costs).
  const zakat = await prisma.fund.create({
    data: { name: "Zakat", type: "ZAKAT", isRestricted: true, allowsExpenses: false, openingBalancePaise: rupees(850000) },
  });
  await prisma.fund.create({
    data: { name: "General", type: "GENERAL", isRestricted: false, allowsExpenses: true, openingBalancePaise: rupees(250000) },
  });

  // ── masters
  const areas = await Promise.all(AREAS.map((name) => prisma.area.create({ data: { name } })));
  const hospitals = await Promise.all(
    HOSPITALS.map((h, i) =>
      prisma.hospital.create({
        data: {
          ...h, state: "Karnataka",
          phone: `0820-2${pad(500000 + i * 1111, 6)}`,
          contactPerson: i % 2 ? "Billing desk" : "Medical social worker",
          bankName: h.isEmpanelled ? "Canara Bank" : null,
          bankAccountLast4: h.isEmpanelled ? pad(1000 + i * 37, 4) : null,
          discountNote: h.isEmpanelled ? "10% concession on MHF-referred cases" : null,
        },
      }),
    ),
  );
  const diseases: { id: string; name: string; categoryId: string }[] = [];
  let order = 0;
  for (const [cat, { color, items }] of Object.entries(DISEASES)) {
    const c = await prisma.diseaseCategory.create({ data: { name: cat, colorToken: color, sortOrder: order++ } });
    for (const [name, isChronic] of items) diseases.push(await prisma.disease.create({ data: { name, isChronic, categoryId: c.id } }));
  }
  const ownBank = await prisma.bank.create({ data: { name: "Canara Bank", branch: "Bhatkal Main", accountLast4: "4821", isOwnAccount: true } });
  await prisma.bank.create({ data: { name: "State Bank of India", branch: "Bhatkal" } });
  await prisma.bank.create({ data: { name: "Bhatkal Urban Co-operative Bank", branch: "Main Road" } });

  // ── people
  let personSerial = 0;
  const people = [];
  for (let i = 0; i < 56; i++) {
    const female = rnd() < 0.45;
    const first = pick(female ? FEMALE : MALE);
    const surname = pick(SURNAMES);
    const fullName = `${first} ${surname}`;
    const mobile = `9${int(100000000, 999999999)}`;
    const age = female ? int(18, 78) : int(3, 82);
    people.push(
      await prisma.person.create({
        data: {
          personCode: `P-${pad(++personSerial, 6)}`,
          fullName,
          fatherName: `${pick(MALE)} ${surname}`,
          husbandName: female && age > 22 ? `${pick(MALE)} ${pick(SURNAMES)}` : null,
          gender: female ? "FEMALE" : "MALE",
          ageYears: age,
          ageRecordedAt: new Date(),
          maritalStatus: age < 20 ? "UNMARRIED" : pick(["MARRIED", "MARRIED", "MARRIED", "WIDOW", "UNMARRIED", "DIVORCED"] as const),
          religion: "Islam",
          mobile,
          addressLine: `H.No. ${int(1, 400)}, ${pick(["Main Road", "Masjid Lane", "Cross Road", "Colony"])}, ${pick(areas).name}, Bhatkal`,
          identityHash: identityHash(fullName, mobile),
          watchFlag: i === 7,
          watchNote: i === 7 ? "Applied through two different relatives in the same month — confirm before approving." : null,
        },
      }),
    );
  }

  // ── donors + donations (current and previous FY)
  const donors = [];
  const DONOR_NAMES = ["Kola Brothers Trading", "Haji Ismail Shabandri", "Gulf Bhatkali Association", "Mohtesham Family Trust", "Dr. Farooq Kazia", "Anonymous", "Jukaku Enterprises", "Siddiqa Charitable Trust", "Bhatkal Muslim Jamat Dubai", "Abdul Gani Damda"];
  for (let i = 0; i < DONOR_NAMES.length; i++) {
    const anon = DONOR_NAMES[i] === "Anonymous";
    donors.push(
      await prisma.donor.create({
        data: {
          donorCode: `D-${pad(i + 1, 5)}`,
          name: anon ? "Private donor (wishes to remain anonymous)" : DONOR_NAMES[i],
          type: anon ? "ANONYMOUS" : /Trust|Association|Jamat/.test(DONOR_NAMES[i]) ? "TRUST" : /Trading|Enterprises/.test(DONOR_NAMES[i]) ? "BUSINESS" : "INDIVIDUAL",
          isAnonymous: anon,
          phone: anon ? null : `9${int(100000000, 999999999)}`,
          city: i % 3 === 0 ? "Dubai" : "Bhatkal",
          country: i % 3 === 0 ? "United Arab Emirates" : "India",
          panLast4: i % 2 ? pad(int(1000, 9999), 4) : null,
        },
      }),
    );
  }
  const receiptSerial: Record<string, number> = {};
  const donationDates: Date[] = [];
  for (let m = 0; m < 18; m++) {
    // April 2025 → September 2026
    const y = m < 9 ? 2025 : 2026;
    const month = ((3 + m) % 12) + 1;
    for (let k = 0; k < int(2, 4); k++) donationDates.push(ist(y, month, int(1, 28)));
  }
  for (const d of donationDates) {
    const fy = fyOf(d);
    receiptSerial[fy] = (receiptSerial[fy] ?? 0) + 1;
    await prisma.donation.create({
      data: {
        receiptNo: `R/${fy}/${pad(receiptSerial[fy], 5)}`,
        donorId: pick(donors).id,
        fundId: zakat.id,
        amountPaise: rupees(pick([10000, 25000, 50000, 75000, 100000, 150000, 250000])),
        donationDate: d,
        mode: pick(["CASH", "CHEQUE", "NEFT", "UPI"] as const),
        bankId: ownBank.id,
        referenceNo: `UTR${int(100000, 999999)}`,
        isReceiptIssued: true,
        createdById: accountant.id,
      },
    });
  }

  // ── applications: entered after MHF has approved them, so they start at Approved.
  // 40 this FY, 14 last FY (paid or closed) so the year-on-year figures have something to compare.
  const put = await storage();
  const statuses: ApplicationStatus[] = [
    ...Array(3).fill("DRAFT"), ...Array(12).fill("APPROVED"), ...Array(8).fill("PAYMENT_PENDING"),
    ...Array(12).fill("PAID"), ...Array(5).fill("CLOSED"),
  ];
  const plan: { status: ApplicationStatus; date: Date }[] = [
    ...statuses.map((status, i) => ({ status, date: ist(2026, 4 + Math.floor((i / statuses.length) * 6), int(1, 26)) })),
    ...Array.from({ length: 14 }, (_, i) => ({ status: (i % 5 === 4 ? "CLOSED" : "PAID") as ApplicationStatus, date: ist(i < 9 ? 2025 : 2026, i < 9 ? 4 + i : i - 8, int(1, 26)) })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const caseSerial: Record<string, number> = {};
  const voucherSerial: Record<string, number> = {};
  let chequeNo = 104200;

  for (const [i, { status, date }] of plan.entries()) {
    const fy = fyOf(date);
    const applicant = people[i % people.length];
    const same = rnd() < 0.35;
    const patient = same ? applicant : people[(i * 7 + 3) % people.length];
    const hospital = pick(hospitals.slice(0, 10));
    const approx = int(40, 600) * 1000;
    const isDraft = status === "DRAFT";
    const serial = isDraft ? 0 : (caseSerial[fy] = (caseSerial[fy] ?? 0) + 1);
    const approved = Math.round((approx * (0.4 + rnd() * 0.5)) / 1000) * 1000;

    const app = await prisma.application.create({
      data: {
        caseNo: isDraft ? `DRAFT/${pad(i, 6)}` : `MHF/${fy}/${pad(serial, 5)}`,
        fiscalYear: fy,
        serial,
        applicationDate: date,
        applicantId: applicant.id,
        patientId: patient.id,
        patientIsApplicant: same,
        relation: same ? "SELF" : pick(["SON", "DAUGHTER", "SPOUSE", "FATHER", "MOTHER", "BROTHER"] as const),
        dependentCount: int(0, 6),
        introducedByName: pick(["Jamat office", "Masjid imam", "Self", "Dr. Haneef", "Neighbour"]),
        attendingDoctor: `Dr. ${pick(["Shetty", "Rao", "Kamath", "Pai", "Nayak", "Hegde"])}`,
        hospitalId: hospital.id,
        diseaseId: pick(diseases).id,
        approxExpensePaise: rupees(approx),
        status,
        approvedAmountPaise: rupees(approved),
        decidedById: isDraft ? null : gensec.id,
        decidedAt: isDraft ? null : date,
        createdById: operator.id,
        createdAt: date,
      },
    });

    const history: [ApplicationStatus | null, ApplicationStatus][] = [[null, "DRAFT"]];
    if (!isDraft) {
      history.push(["DRAFT", "APPROVED"]);
      if (status === "PAYMENT_PENDING") history.push(["APPROVED", "PAYMENT_PENDING"]);
      if (status === "PAID" || status === "CLOSED") history.push(["APPROVED", "PAID"]);
      if (status === "CLOSED") history.push(["PAID", "CLOSED"]);
    }
    await prisma.applicationStatusHistory.createMany({
      data: history.map(([fromStatus, toStatus], k) => ({
        applicationId: app.id, fromStatus, toStatus, changedById: k < 2 ? operator.id : accountant.id,
        changedAt: new Date(date.getTime() + k * 36e5 * 20),
      })),
    });
    await prisma.auditLog.create({
      data: { actorId: operator.id, action: "CREATE", entity: "Application", entityId: app.id, summary: `Created case ${app.caseNo}`, createdAt: date },
    });

    // payments
    if (["PAYMENT_PENDING", "PAID", "CLOSED"].includes(status)) {
      const parts = status === "PAYMENT_PENDING" ? [Math.round(approved / 2000) * 1000] : rnd() < 0.3 ? [approved / 2, approved / 2] : [approved];
      for (const [k, amt] of parts.entries()) {
        const pd = new Date(date.getTime() + (k + 3) * 864e5 * 4);
        const pfy = fyOf(pd);
        voucherSerial[pfy] = (voucherSerial[pfy] ?? 0) + 1;
        const old = Date.now() - pd.getTime() > 864e5 * 45;
        const pay = await prisma.payment.create({
          data: {
            voucherNo: `V/${pfy}/${pad(voucherSerial[pfy], 5)}`,
            applicationId: app.id, fundId: zakat.id, amountPaise: rupees(amt), mode: "CHEQUE",
            chequeNo: String(chequeNo++), bankId: ownBank.id, paymentDate: pd, towards: "HOSPITAL_BILL",
            payeeType: "HOSPITAL", hospitalId: hospital.id,
            status: old || i % 4 ? "CLEARED" : "ISSUED", clearedAt: old || i % 4 ? new Date(pd.getTime() + 864e5 * 5) : null,
            createdById: accountant.id,
          },
        });
        await prisma.auditLog.create({
          data: { actorId: accountant.id, action: "PAY", entity: "Payment", entityId: pay.id, summary: `Recorded payment ${pay.voucherNo} for case ${app.caseNo}`, createdAt: pd },
        });
      }
    }

    // attachments (demo PDFs)
    if (!isDraft) {
      const types = ["GOVT_ID", "HOSPITAL_BILL", "HOSPITAL_LETTER", "MHF_APPLICATION_FORM", ...(rnd() < 0.5 ? ["DISCHARGE_SUMMARY"] : [])] as const;
      const present = status === "ON_HOLD" ? types.slice(0, 2) : types;
      for (const t of present) {
        const key = `applications/${app.id}/${t.toLowerCase()}-${i}.pdf`;
        if (put) await put(key);
        await prisma.attachment.create({
          data: {
            type: t as AttachmentType, storageKey: key, originalName: `${t.toLowerCase()}.pdf`, mimeType: "application/pdf",
            sizeBytes: SAMPLE_PDF.length, pageCount: 1, containsIdentity: t !== "HOSPITAL_BILL",
            applicationId: app.id, uploadedById: operator.id, createdAt: date,
          },
        });
      }
    }
  }

  // fiscal years: every year that has seeded records, plus the current one, started and open
  const fyCodes = [...new Set([...Object.keys(caseSerial), ...Object.keys(voucherSerial), ...Object.keys(receiptSerial), fyOf(new Date())])].sort();
  await prisma.fiscalYear.createMany({
    data: fyCodes.map((code) => {
      const y = Number(code.slice(0, 4));
      return { code, startsOn: fromZonedTime(`${y}-04-01T00:00:00`, TZ), endsOn: fromZonedTime(`${y + 1}-04-01T00:00:00`, TZ), openedById: admin.id };
    }),
  });

  // counters so the next generated numbers follow the seeded ones
  const counters: Prisma.CounterCreateManyInput[] = [
    { id: "person", value: personSerial },
    { id: "donor", value: donors.length },
    ...Object.entries(caseSerial).map(([fy, v]) => ({ id: `case:${fy}`, value: v })),
    ...Object.entries(voucherSerial).map(([fy, v]) => ({ id: `voucher:${fy}`, value: v })),
    ...Object.entries(receiptSerial).map(([fy, v]) => ({ id: `receipt:${fy}`, value: v })),
  ];
  await prisma.counter.createMany({ data: counters });
  await prisma.setting.create({ data: { key: "meetingMode.global", value: false, updatedById: admin.id } });

  console.log(`Seeded ${plan.length} cases, ${people.length} people, ${donationDates.length} donations. Password for every demo user: ${production ? "SEED_ADMIN_PASSWORD (change required at first sign-in)" : "Mhf@2026!"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
