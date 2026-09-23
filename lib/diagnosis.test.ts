import { describe, expect, it } from "vitest";
import { computeRiskLevel, finalizeDiagnosis, riskVerdict, type RawDiagnosis } from "./diagnosis";
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
  environment_risks: [{ title: "冷え込み", detail: "…", severity: 4 }],
  bio_site_risks: [{ title: "ブヨ", detail: "…", severity: 2 }],
  recommended_tags: ["#防寒", "防寒", " Rain "],
  packing_list: packing,
  overall_advice: " アドバイス ",
});

describe("finalizeDiagnosis", () => {
  const gears = [gear("g1", "寝袋"), gear("g2", "ランタン", true), gear("g3", "チェア", true)];

  it("定番装備はAIが入れ忘れても必ず含める", () => {
    const r = finalizeDiagnosis(
      raw([{ item: "ランタン", category: "safety_and_tools", priority: "optional", reason: "", gear_id: "g2" }]),
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
        { item: "謎ギア", category: "other", priority: "must", reason: "", gear_id: "fake" },
        { item: "寝袋", category: "other", priority: "must", reason: "", gear_id: null },
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
        { item: "寝袋", category: "shelter_and_sleep", priority: "must", reason: "", gear_id: "g1" },
        { item: "寝袋", category: "shelter_and_sleep", priority: "must", reason: "", gear_id: "g1" },
      ]),
      [gear("g1", "寝袋")],
      0,
    );
    expect(r.packing_list).toHaveLength(1);
  });

  it("準備度とカバー件数は同じパッキングリストから計算する", () => {
    const r = finalizeDiagnosis(
      raw([
        { item: "寝袋", category: "shelter_and_sleep", priority: "must", reason: "", gear_id: "g1" },
        { item: "マット", category: "shelter_and_sleep", priority: "must", reason: "", gear_id: null },
        { item: "蚊取り線香", category: "other", priority: "recommended", reason: "", gear_id: null },
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
    input.environment_risks = [{ title: "a", detail: "b", severity: 9 }];
    input.bio_site_risks = [{ title: "c", detail: "d", severity: 0 }];
    const r = finalizeDiagnosis(input, [], 0);
    expect(r.environment_risks[0].severity).toBe(5);
    expect(r.bio_site_risks[0].severity).toBe(1);
    expect(r.risk_level).toBe(3);
    expect(r.recommended_tags).toEqual(["防寒", "rain"]);
    expect(r.overall_advice).toBe("アドバイス");
    expect(r.readiness_pct).toBe(0);
  });
});

describe("risk level", () => {
  it("平均を小数1桁で返す", () => {
    expect(computeRiskLevel([])).toBe(1);
    expect(
      computeRiskLevel([
        { title: "", detail: "", severity: 2 },
        { title: "", detail: "", severity: 3 },
        { title: "", detail: "", severity: 3 },
      ]),
    ).toBe(2.7);
  });

  it("点数ごとの判定", () => {
    expect(riskVerdict(1.2).label).toBe("問題なし");
    expect(riskVerdict(2.0).label).toBe("軽度の注意");
    expect(riskVerdict(3.0).label).toBe("要注意");
    expect(riskVerdict(4.1).label).toBe("警戒");
  });
});
