import { describe, expect, it } from "vitest";
import type { DiagnosisResult, Risk } from "@/lib/domain";
import { applyStableRisks, pickRegionRisks, planMonth, stableStringify, weatherRisks } from "./stable-risks";

const stay = (o: Partial<Parameters<typeof weatherRisks>[0]> = {}) => ({
  temp_min: 16,
  temp_max: 24,
  precip_prob_max: 10,
  precip_total_mm: 0,
  wind_max_ms: 2,
  gust_max_ms: 5,
  ...o,
});

describe("天気のリスク（予報の数字で決まる）", () => {
  it("同じ予報なら毎回同じ危険度", () => {
    const s = stay({ precip_prob_max: 100, precip_total_mm: 12, gust_max_ms: 7.7, temp_min: 14.3 });
    expect(weatherRisks(s, 1)).toEqual(weatherRisks(s, 1));
    expect(weatherRisks(s, 1).map((r) => r.severity)).toEqual([4, 2, 2]);
  });

  it("雨・風・寒さ・暑さの目安", () => {
    expect(weatherRisks(stay(), 1)).toEqual([]);
    expect(weatherRisks(stay({ precip_total_mm: 60, precip_prob_max: 90 }), 1)[0].severity).toBe(5);
    expect(weatherRisks(stay({ gust_max_ms: 16 }), 1)[0]).toMatchObject({ severity: 4, basis: "forecast" });
    expect(weatherRisks(stay({ temp_min: 3 }), 1)[0].risk).toContain("夜の最低3℃");
    expect(weatherRisks(stay({ temp_min: 3 }), 0)[0].risk).toContain("最低3℃。防寒着");
    expect(weatherRisks(stay({ temp_min: 26, temp_max: 34 }), 1).map((r) => r.severity)).toEqual([3, 3]);
    // デイキャンプは夜の冷え込み（最低15℃以下の注意）を出さない
    expect(weatherRisks(stay({ temp_min: 14 }), 0)).toEqual([]);
  });
});

describe("地域リスク（同じ場所・同じ月なら前回のもの）", () => {
  const bear: Risk = { risk: "クマの生息域", severity: 3, basis: "season_region" };
  const plan = (lat: number, planned: string | null, created = "2026-09-01T00:00:00Z") => ({
    planned_date: planned,
    created_at: created,
    result: {
      location: { name: "x", address: "", lat, lon: 138.57, elevation_m: null },
      environment_risks: [{ risk: "雨", severity: 4, basis: "forecast" }],
      bio_site_risks: [bear, { risk: "ぬかるみ", severity: 2, basis: "terrain" }],
    } as unknown as DiagnosisResult,
  });

  it("3km以内・同じ月の診断から、季節・地域のリスクだけを取る", () => {
    expect(planMonth("2026-10-03", "2026-09-23")).toBe("10");
    expect(planMonth(null, "2026-09-23")).toBe("09");
    const found = pickRegionRisks([plan(35.405, "2025-10-10")], { lat: 35.41, lon: 138.57 }, "10");
    expect(found).toEqual({ environment: [], bio: [bear] });
    expect(pickRegionRisks([plan(35.405, "2026-11-01")], { lat: 35.41, lon: 138.57 }, "10")).toBeNull();
    expect(pickRegionRisks([plan(35.6, "2026-10-01")], { lat: 35.41, lon: 138.57 }, "10")).toBeNull();
  });

  it("AIの同じ種類のリスクを置き換える", () => {
    const ai = {
      environment: [{ risk: "AIの雨", severity: 3, basis: "forecast" as const }, { risk: "地面", severity: 2, basis: "terrain" as const }],
      bio: [{ risk: "AIの野生動物", severity: 2, basis: "season_region" as const }],
    };
    const out = applyStableRisks(ai, {
      weather: [{ risk: "雨100%", severity: 4, basis: "forecast" }],
      region: { environment: [], bio: [bear] },
    });
    expect(out.environment.map((r) => r.risk)).toEqual(["雨100%", "地面"]);
    expect(out.bio.map((r) => r.risk)).toEqual(["クマの生息域"]);
    // 決まったリスクがなければ AI のまま
    expect(applyStableRisks(ai, {})).toEqual(ai);
  });
});

describe("条件の指紋", () => {
  it("キーの順番が違っても同じ文字列、undefined は無視", () => {
    expect(stableStringify({ b: 1, a: [2, { d: undefined, c: 3 }] })).toBe(stableStringify({ a: [2, { c: 3 }], b: 1 }));
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});
