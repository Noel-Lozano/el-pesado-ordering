import { defineConfig } from "vitest/config";

// Integration tests hit the real database in DATABASE_URL (Twilio is mocked).
// They create their own customer/orders and delete them afterwards.
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["src/test/integrationSetup.ts"],
    // One shared database: run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
