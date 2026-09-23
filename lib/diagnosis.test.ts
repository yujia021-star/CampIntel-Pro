import { describe, expect, it } from "vitest";
import { computeRiskLevel, finalizeDiagnosis, riskLevelTone, riskVerdict, severityLabel, type RawDiagnosis } from "./diagnosis";
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
  environment_risks: [{ risk: "冷え込み", severity: 4 }],
  bio_site_risks: [{ risk: "ブヨ", severity: 2 }],
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

  it("severity を1〜5に丸め、タグを正規化する", () => {
    const input = raw([]);
    input.environment_risks = [{ risk: "a", severity: 9 }];
    input.bio_site_risks = [{ risk: "c", severity: 0 }];
    const r = finalizeDiagnosis(input, [], 0);
    expect(r.environment_risks[0].severity).toBe(5);
    expect(r.bio_site_risks[0].severity).toBe(1);
    expect(r.risk_level).toBe(3);
    expect(r.recommended_tags).toEqual(["防寒", "rain"]);
    expect(r.overall_advice).toBe("アドバイス");
    // パッキングリストが空なら準備度100%（プロトタイプと同じ）
    expect(r.readiness_pct).toBe(100);
  });
});

describe("risk level", () => {
  it("平均を小数1桁で返す", () => {
    expect(computeRiskLevel([])).toBe(0);
    expect(
      computeRiskLevel([
        { risk: "", severity: 2 },
        { risk: "", severity: 3 },
        { risk: "", severity: 3 },
      ]),
    ).toBe(2.7);
  });

  it("点数ごとの判定（2未満/3未満/4未満/4以上）", () => {
    expect(riskVerdict(0).title).toContain("問題なし");
    expect(riskVerdict(1.9).title).toContain("問題なし");
    expect(riskVerdict(2.0).title).toContain("軽度の注意");
    expect(riskVerdict(3.0).title).toContain("要注意");
    expect(riskVerdict(4.0).title).toContain("警戒");
  });

  it("色分けと深刻度ラベル", () => {
    expect(riskLevelTone(2.4)).toBe("ok");
    expect(riskLevelTone(2.5)).toBe("low");
    expect(riskLevelTone(4)).toBe("high");
    expect(severityLabel(2).label).toBe("軽微");
    expect(severityLabel(3).label).toBe("中程度");
    expect(severityLabel(5).label).toBe("重大");
  });
});
