import { defineConfig } from "vitest/config";

// `npm test` runs unit tests only. Integration tests (*.integration.test.ts)
// write to the database in DATABASE_URL, so they run separately with
// `npm run test:integration` (vitest.integration.config.ts).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts", "node_modules/**"],
  },
});
