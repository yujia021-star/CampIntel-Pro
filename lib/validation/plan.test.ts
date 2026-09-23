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

describe("parseDiagnoseInput", () => {
  it("選んだ場所を計画の列と分けて取り出す", async () => {
    const { parseDiagnoseInput } = await import("./plan");
    const r = parseDiagnoseInput({
      campsite: "ふもとっぱら",
      place_name: "ふもとっぱら",
      place_address: "静岡県 富士宮市",
      place_lat: "35.40",
      place_lon: "138.57",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan).not.toHaveProperty("place_lat");
    expect(r.place).toEqual({ name: "ふもとっぱら", address: "静岡県 富士宮市", lat: 35.4, lon: 138.57 });
  });

  it("場所を選んでいなければ null", async () => {
    const { parseDiagnoseInput } = await import("./plan");
    const r = parseDiagnoseInput({ campsite: "どこか" });
    expect(r.ok && r.place).toBeNull();
  });
});
