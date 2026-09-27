import path from "node:path";
import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgresql://mhf:mhf@localhost:5433/mhf_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    fileParallelism: false, // the suites share one test database
    testTimeout: 30_000,
    globalSetup: ["test/setup-db.ts"],
    env: { NODE_ENV: "test", DATABASE_URL: TEST_DATABASE_URL, S3_ENDPOINT: "" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});
