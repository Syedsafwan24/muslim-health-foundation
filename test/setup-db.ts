import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "./db-url";

// Still exported from here: it was this module's public surface before the resolution rules
// moved to ./db-url, and vitest.config.ts is not the only possible caller.
export { TEST_DATABASE_URL };

/**
 * A separate test database, so the demo data is never touched. Non-destructive: applies any
 * pending migrations and seeds only when empty. Suites create uniquely named records, so they
 * pass against a database that earlier runs have written to.
 */
export default function setup() {
  // No object storage for tests: the seed records attachments without uploading files.
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, S3_ENDPOINT: "" };
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "pipe", env });
}
