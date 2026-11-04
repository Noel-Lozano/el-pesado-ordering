import { defineConfig } from "vitest/config";

// `npm test` runs unit tests only. Integration tests (*.integration.test.ts)
// write to the database in DATABASE_URL, so they run separately with
// `npm run test:integration`.
const INTEGRATION_TEST_GLOB = "src/**/*.integration.test.ts";
const runIntegration = process.env.VITEST_INTEGRATION === "1";

export default defineConfig({
  test: {
    include: runIntegration ? [INTEGRATION_TEST_GLOB] : ["src/**/*.test.ts"],
    exclude: runIntegration ? [] : [INTEGRATION_TEST_GLOB],
    // Integration tests share one database; keep them sequential.
    fileParallelism: !runIntegration,
  },
});
