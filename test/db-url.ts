import { readFileSync } from "node:fs";

/**
 * Where the test suites' database lives.
 *
 * Deliberately not a hardcoded `user:password@host:port`. A fixed credential pair aimed at a
 * fixed port goes wrong in two ways once the app is deployed: it fails outright when the real
 * password is rotated, and — worse — port 5433 on a server may be a *different* Postgres than
 * the developer's, so a literal fallback silently points the suites at someone else's database.
 *
 * Resolution order:
 *   1. DATABASE_URL_TEST — set it to override everything.
 *   2. A sibling `mhf_test` database on whatever DATABASE_URL already points to, so tests reuse
 *      credentials this environment is known to work with.
 *   3. The local-development default from docker-compose.yml.
 *
 * Both process.env and .env are consulted: Vitest config is evaluated before anything loads
 * .env, so reading the file is the only way to see what the app itself would use.
 */
const TEST_DB_NAME = "mhf_test";
const DEV_FALLBACK = `postgresql://mhf:mhf@localhost:5433/${TEST_DB_NAME}`;

function fromEnvFile(key: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(`${process.cwd()}/.env`, "utf8");
  } catch {
    return undefined; // no .env here (CI, or a checkout that never ran the dev setup)
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0 || trimmed.slice(0, eq).trim() !== key) continue;
    return trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const read = (key: string) => process.env[key] ?? fromEnvFile(key);

function siblingTestDatabase(primary: string): string {
  const url = new URL(primary);
  const name = url.pathname.replace(/^\//, "");
  if (name === TEST_DB_NAME) return primary;
  url.pathname = `/${TEST_DB_NAME}`;
  return url.toString();
}

function resolve(): string {
  const explicit = read("DATABASE_URL_TEST");
  if (explicit) return explicit;
  const primary = read("DATABASE_URL");
  if (!primary) return DEV_FALLBACK;
  const derived = siblingTestDatabase(primary);
  // Refuse to run the suites against the application's own database: they migrate and seed.
  if (new URL(derived).pathname === new URL(primary).pathname) {
    throw new Error(
      `Refusing to run tests against the application database (${new URL(primary).pathname.slice(1)}). ` +
        `Set DATABASE_URL_TEST to a separate database.`,
    );
  }
  return derived;
}

export const TEST_DATABASE_URL = resolve();
