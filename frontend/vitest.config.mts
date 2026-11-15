import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // All tests live in src/test/unit, mirroring the source path they cover.
    // Pure logic in *.test.ts runs in Node; component tests (*.test.tsx) opt
    // into jsdom with a `// @vitest-environment jsdom` comment at the top.
    include: ["src/test/unit/**/*.test.ts", "src/test/unit/**/*.test.tsx"],
  },
});
