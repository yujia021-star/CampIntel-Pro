import { describe, expect, it } from "vitest";
import type { DiagnosisResult } from "@/lib/domain";
import { CONSULT_SERVICES, consultText } from "./consult";

const result = {
  environment_risks: [{ risk: "夜の最低4℃。寝袋・マット・防寒着で冷え込み対策を", severity: 4, basis: "forecast" }],
  bio_site_risks: [{ risk: "ツキノワグマの生息域。食料は車内に保管し、熊鈴を", severity: 3, basis: "season_region" }],
  recommended_tags: [],
  packing_list: [
    { item: "OneTigris STELA", category: "shelter_and_sleep", priority: "must", gear_id: "g1", owned: true, is_base: false, consumable: false },
    { item: "断熱マット", category: "shelter_and_sleep", priority: "must", gear_id: null, owned: false, is_base: false, consumable: false },
    { item: "ゴミ袋", category: "other", priority: "must", gear_id: null, owned: false, is_base: false, consumable: true },
  ],
  overall_advice: "",
  risk_level: 4, readiness_pct: 33, owned_count: 1, total_count: 3, diary_count_used: 0,
  location: { name: "ふもとっぱらキャンプ場", address: "静岡県 富士宮市 麓", lat: 35.4, lon: 138.57, elevation_m: 850 },
  stay: { nights: 1, start: "2026-10-03", end: "2026-10-04" },
  personal: { level: "ビギナー", tendency: "予報より寒く感じやすいタイプ" },
} as DiagnosisResult;

describe("いつものAIに相談する文章", () => {
  it("行き先・日程・ギア・判定・クセをまとめる", () => {
    const t = consultText(result, { transport: "車", companions: "子どもなし" });
    expect(t).toContain("行き先：ふもとっぱらキャンプ場（静岡県 富士宮市 麓・標高850m）");
    expect(t).toContain("日程：10/3(土)〜10/4(日)・1泊・車・子どもなし");
    expect(t).toContain("持っているギア：OneTigris STELA");
    expect(t).toContain("足りないと判定したもの：断熱マット");
    expect(t).not.toContain("ゴミ袋");
    expect(t).toContain("夜の最低4℃（危険度4）");
    expect(t).toContain("私のクセ：予報より寒く感じやすいタイプ");
  });

  it("ChatGPTは質問を入れた状態で開く", () => {
    expect(CONSULT_SERVICES[0].url("寒い")).toBe(`https://chatgpt.com/?q=${encodeURIComponent("寒い")}`);
  });
});
