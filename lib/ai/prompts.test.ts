import { describe, expect, it } from "vitest";
import type { DiaryEntry } from "@/lib/domain";
import { buildDiagnosisPrompt, diarySummary } from "./prompts";

const entry = (over: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id: "d",
  user_id: "u",
  campsite: "x",
  date: "2026-09-01",
  weather: "晴れ",
  temp_feel: "寒すぎ",
  bugs: "なし",
  sleep_quality: 2,
  good_gear: [],
  bad_gear: [],
  note: null,
  created_at: "",
  ...over,
});

describe("diarySummary", () => {
  it("診断から書いた日記には、そのときの予報と体感を並べる", () => {
    const s = diarySummary([{ ...entry({ nights: 1 }), forecast: { temp_min: 8, temp_max: 18, precip_prob_max: 20 } }]);
    expect(s).toContain("滞在:1泊");
    expect(s).toContain("体感:寒すぎ");
    expect(s).toContain("そのときの予報:最低8℃/最高18℃・降水確率20%");
  });

  it("デイキャンプの日記には眠りの質を入れない", () => {
    expect(diarySummary([entry({ nights: 0 })])).not.toContain("睡眠");
    expect(diarySummary([entry({ nights: 1 })])).toContain("睡眠:★2");
  });
});

describe("buildDiagnosisPrompt", () => {
  it("滞在タイプを伝える", () => {
    const plan = {
      campsite: "x",
      nights: 0,
      elevation_m: null,
      terrain: null,
      ground: null,
      planned_date: "2026-10-10",
      expected_low_c: null,
      expected_high_c: null,
      transport: null,
      companions: null,
      style: null,
    };
    expect(buildDiagnosisPrompt(plan, [], [])).toContain("滞在: デイキャンプ");
    expect(buildDiagnosisPrompt({ ...plan, nights: 2 }, [], [])).toContain("滞在: 2泊");
  });
});
