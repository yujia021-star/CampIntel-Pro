import { describe, expect, it } from "vitest";
import {
  computeRiskLevel,
  buildConditions,
  countBySeverity,
  finalizeDiagnosis,
  riskVerdict,
  severityLabel,
  type RawDiagnosis,
} from "./diagnosis";
import type { Gear } from "./domain";

const gear = (id: string, name: string, is_base = false): Gear => ({
  id,
  user_id: "u",
  name,
  tags: [],
  category: "shelter_and_sleep",
  is_base,
  created_at: "",
});

const raw = (packing: RawDiagnosis["packing_list"]): RawDiagnosis => ({
  environment_risks: [{ risk: "冷え込み", severity: 4, basis: "forecast" }],
  bio_site_risks: [{ risk: "ブヨ", severity: 2, basis: "made_up" }],
  recommended_tags: ["#防寒", "防寒", " Rain "],
  packing_list: packing,
  overall_advice: " アドバイス ",
});

describe("finalizeDiagnosis", () => {
  const gears = [gear("g1", "寝袋"), gear("g2", "ランタン", true), gear("g3", "チェア", true)];

  it("定番装備はAIが入れ忘れても必ず含める", () => {
    const r = finalizeDiagnosis(
      raw([{ item: "ランタン", category: "safety_and_tools", priority: "optional", gear_id: "g2" }]),
      gears,
      0,
    );
    const base = r.packing_list.filter((p) => p.is_base).map((p) => p.gear_id);
    expect(base.sort()).toEqual(["g2", "g3"]);
    // 定番は必須扱い・カテゴリは登録内容を優先
    expect(r.packing_list.find((p) => p.gear_id === "g2")).toMatchObject({ priority: "must", category: "shelter_and_sleep" });
  });

  it("存在しない gear_id は捨て、名前一致なら所持とみなす", () => {
    const r = finalizeDiagnosis(
      raw([
        { item: "謎ギア", category: "other", priority: "must", gear_id: "fake" },
        { item: "寝袋", category: "other", priority: "must", gear_id: null },
      ]),
      [gear("g1", "寝袋")],
      0,
    );
    expect(r.packing_list[0]).toMatchObject({ item: "謎ギア", owned: false, gear_id: null });
    expect(r.packing_list[1]).toMatchObject({ item: "寝袋", owned: true, gear_id: "g1" });
  });

  it("同じ所持ギアの重複を除く", () => {
    const r = finalizeDiagnosis(
      raw([
        { item: "寝袋", category: "shelter_and_sleep", priority: "must", gear_id: "g1" },
        { item: "寝袋", category: "shelter_and_sleep", priority: "must", gear_id: "g1" },
      ]),
      [gear("g1", "寝袋")],
      0,
    );
    expect(r.packing_list).toHaveLength(1);
  });

  it("準備度とカバー件数は同じパッキングリストから計算する", () => {
    const r = finalizeDiagnosis(
      raw([
        { item: "寝袋", category: "shelter_and_sleep", priority: "must", gear_id: "g1" },
        { item: "マット", category: "shelter_and_sleep", priority: "must", gear_id: null },
        { item: "蚊取り線香", category: "other", priority: "recommended", gear_id: null },
      ]),
      [gear("g1", "寝袋")],
      3,
    );
    expect(r.owned_count).toBe(1);
    expect(r.total_count).toBe(3);
    expect(r.readiness_pct).toBe(33);
    expect(r.owned_count).toBe(r.packing_list.filter((p) => p.owned).length);
    expect(r.diary_count_used).toBe(3);
  });

  it("不明な根拠は一般的傾向として扱う", () => {
    const r = finalizeDiagnosis(raw([]), [], 0);
    expect(r.environment_risks[0].basis).toBe("forecast");
    expect(r.bio_site_risks[0].basis).toBe("season_region");
  });

  it("場所と天気予報を結果に残す", () => {
    const location = { name: "x", address: "y", lat: 35, lon: 138, elevation_m: 800 };
    const weather = { available: false as const, reason: "no_date" as const, message: "" };
    const r = finalizeDiagnosis(raw([]), [], 0, { location, weather });
    expect(r.location).toEqual(location);
    expect(r.weather).toEqual(weather);
  });

  it("severity を1〜5に丸め、タグを正規化する", () => {
    const input = raw([]);
    input.environment_risks = [{ risk: "a", severity: 9, basis: "terrain" }];
    input.bio_site_risks = [{ risk: "c", severity: 0, basis: "diary" }];
    const r = finalizeDiagnosis(input, [], 0);
    expect(r.environment_risks[0].severity).toBe(5);
    expect(r.bio_site_risks[0].severity).toBe(1);
    expect(r.risk_level).toBe(5);
    expect(r.recommended_tags).toEqual(["防寒", "rain"]);
    expect(r.overall_advice).toBe("アドバイス");
    // パッキングリストが空なら準備度100%（プロトタイプと同じ）
    expect(r.readiness_pct).toBe(100);
  });
});

describe("risk level", () => {
  const risk = (severity: number) => ({ risk: "", basis: "input" as const, severity });

  it("総合はいちばん高いリスク（平均で薄めない）", () => {
    expect(computeRiskLevel([])).toBe(0);
    // 軽微が多くても、1つでも高いリスクがあれば総合も高い
    expect(computeRiskLevel([risk(2), risk(2), risk(2), risk(2), risk(4)])).toBe(4);
    expect(riskVerdict(computeRiskLevel([risk(2), risk(2), risk(4)])).title).toContain("警戒");
  });

  it("点数ごとの判定", () => {
    expect(riskVerdict(0).title).toContain("問題なし");
    expect(riskVerdict(1).title).toContain("問題なし");
    expect(riskVerdict(2).title).toContain("軽度の注意");
    expect(riskVerdict(3).title).toContain("要注意");
    expect(riskVerdict(4).title).toContain("警戒");
    expect(riskVerdict(5).title).toContain("危険");
    // 以前の履歴（平均値の小数）も判定できる
    expect(riskVerdict(2.3).title).toContain("軽度の注意");
  });

  it("個々のリスクのラベルと色", () => {
    expect(severityLabel(2)).toEqual({ label: "軽微", tone: "ok" });
    expect(severityLabel(3)).toEqual({ label: "注意", tone: "mid" });
    expect(severityLabel(4)).toEqual({ label: "高", tone: "high" });
    expect(severityLabel(5)).toEqual({ label: "危険", tone: "high" });
  });

  it("危険度ごとの件数", () => {
    expect(countBySeverity([risk(1), risk(2), risk(3), risk(4), risk(5)])).toEqual({ high: 2, mid: 1, low: 2 });
  });
});

describe("buildConditions", () => {
  const plan = {
    campsite: "x",
    nights: 1,
    elevation_m: null,
    terrain: null,
    ground: "砂利",
    planned_date: "2026-10-10",
    expected_low_c: null,
    expected_high_c: null,
    transport: null,
    companions: null,
    style: null,
  };
  const location = { name: "x", address: "", lat: 35, lon: 138, elevation_m: 822 };
  const weather = {
    available: true as const,
    forecast: {
      source: "open-meteo" as const,
      fetched_at: "",
      days: [],
      hours: [],
      stay: { temp_min: 16.7, temp_max: 24.4, precip_prob_max: 10, precip_total_mm: 0, wind_max_ms: 3, gust_max_ms: 6 },
    },
  };

  it("標高は国土地理院、気温は予報、地形はAIの推定、入力した地面は入力のまま", () => {
    expect(buildConditions(plan, { site_terrain: "高原の草地", site_ground: "芝生" }, location, weather)).toEqual({
      elevation_m: 822,
      elevation_source: "gsi",
      temp_min: 16.7,
      temp_max: 24.4,
      temp_source: "forecast",
      terrain: "高原の草地",
      terrain_source: "ai",
      ground: "砂利",
      ground_source: "input",
    });
  });

  it("データがなく、AIも「不明」なら null", () => {
    const c = buildConditions(plan, { site_terrain: "不明", site_ground: "" }, null, null);
    expect(c).toMatchObject({ elevation_m: null, elevation_source: null, temp_source: null, terrain: null, terrain_source: null });
  });
});

describe("滞在の日程", () => {
  it("泊数から最終日を出す（デイは同じ日）", async () => {
    const { stayOf } = await import("./diagnosis");
    expect(stayOf({ nights: 2, planned_date: "2026-10-10" })).toEqual({ nights: 2, start: "2026-10-10", end: "2026-10-12" });
    expect(stayOf({ nights: 0, planned_date: "2026-10-10" })).toEqual({ nights: 0, start: "2026-10-10", end: "2026-10-10" });
    expect(stayOf({ nights: 1, planned_date: null })).toEqual({ nights: 1, start: null, end: null });
  });
});
