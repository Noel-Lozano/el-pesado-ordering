import { defineConfig } from "vitest/config";

// All tests live in src/test, mirroring the source path they cover:
//   src/test/unit/...         `npm test`, no database or network
//   src/test/integration/...  `npm run test:integration` (vitest.integration.config.ts),
//                             writes to the database in DATABASE_URL
export default defineConfig({
  test: {
    include: ["src/test/unit/**/*.test.ts"],
  },
});
