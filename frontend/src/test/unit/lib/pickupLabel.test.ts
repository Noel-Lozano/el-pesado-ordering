import { describe, expect, it } from "vitest";
import { describePickup } from "@/lib/pickupLabel";

const TIMEZONE = "America/Ciudad_Juarez";

describe("describePickup", () => {
  it("describes ASAP", () => {
    expect(describePickup({ kind: "asap" }, TIMEZONE)).toBe("Lo antes posible");
  });

  it("shows a scheduled time in the shop's timezone (UTC-7)", () => {
    expect(describePickup({ kind: "scheduled", time: "2026-11-10T21:30:00.000Z" }, TIMEZONE)).toBe(
      "Hoy a las 2:30 PM",
    );
  });
});
