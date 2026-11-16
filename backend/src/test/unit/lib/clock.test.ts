import { expect, it } from "vitest";

// Deliberately flaky (eval case): passes about half the time.
it("depends on the current millisecond", () => {
  expect(Date.now() % 2).toBe(0);
});
