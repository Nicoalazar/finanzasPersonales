import { defineConfig } from "vitest/config";

const testDb = process.env.TEST_DATABASE_URL ?? "postgresql://finanzas:finanzas@localhost:5433/finanzas_test";

export default defineConfig({
  test: {
    env: { DATABASE_URL: testDb, JWT_SECRET: "test-secret-test-secret", NODE_ENV: "test" },
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
  },
});
