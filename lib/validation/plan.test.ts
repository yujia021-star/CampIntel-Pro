import { describe, expect, it } from "vitest";
import { CampPlanInputSchema } from "./plan";

describe("CampPlanInputSchema", () => {
  it("空欄を null にし、数値文字列を数値にする", () => {
    const r = CampPlanInputSchema.parse({
      campsite: " ふもとっぱら ",
      elevation_m: "850.4",
      terrain: "",
      planned_date: "",
      expected_low_c: "-2",
    });
    expect(r).toMatchObject({
      campsite: "ふもとっぱら",
      elevation_m: 850,
      terrain: null,
      planned_date: null,
      expected_low_c: -2,
      expected_high_c: null,
    });
  });

  it("キャンプ場名は必須", () => {
    expect(CampPlanInputSchema.safeParse({ campsite: "  " }).success).toBe(false);
  });

  it("範囲外の数値は弾く", () => {
    expect(CampPlanInputSchema.safeParse({ campsite: "x", elevation_m: 99999 }).success).toBe(false);
  });
});
