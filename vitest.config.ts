import path from "node:path";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./test/db-url";

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
