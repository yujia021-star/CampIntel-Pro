import { describe, expect, it } from "vitest";
import type { Gear } from "@/lib/domain";
import { ruleDiagnosis } from "./diagnose";
import { matchGears, packingRules } from "./packing";

const STAY = { temp_min: 12, temp_max: 22, precip_prob_max: 10, precip_total_mm: 0, wind_max_ms: 2, gust_max_ms: 5 };
const ctx = (o: Partial<Parameters<typeof packingRules>[0]> = {}) => ({
  nights: 1,
  month: 10,
  stay: STAY,
  labels: ["晴れ"],
  transport: "車",
  companions: "子どもなし",
  bear: false,
  feelsCold: false,
  ...o,
});
const names = (o: Partial<Parameters<typeof packingRules>[0]> = {}) => packingRules(ctx(o)).map((r) => r.item);
const gear = (id: string, name: string, tags: string[] = []): Gear => ({
  id, user_id: "u", name, tags, category: "other", is_base: false, created_at: "",
});

describe("持ち物のルール", () => {
  it("泊まりは寝る道具、デイキャンプは出さない", () => {
    expect(names()).toEqual(expect.arrayContaining(["テント", "寝袋", "マット", "ランタン"]));
    expect(names({ nights: 0 })).not.toContain("寝袋");
    expect(names({ nights: 0 })).toContain("レジャーシート");
    expect(names({ nights: 2 })).toContain("食料（2泊分）");
  });

  it("予報で雨・寒さ・暑さ・風の物を足す", () => {
    expect(names({ stay: { ...STAY, precip_prob_max: 70, precip_total_mm: 5 } })).toContain("レインウェア");
    expect(names({ labels: ["雷雨"] })).toContain("レインウェア");
    const cold = names({ stay: { ...STAY, temp_min: 4 } });
    expect(cold).toEqual(expect.arrayContaining(["断熱マット", "防寒着（フリース・ダウン）", "カイロ"]));
    expect(names({ stay: { ...STAY, temp_max: 31 } })).toContain("日焼け止め");
    expect(names({ stay: { ...STAY, gust_max_ms: 12 } })).toContain("予備のペグ・張り綱");
  });

  it("定番の物と、条件で足した物を分ける", () => {
    const rules = packingRules(ctx({ stay: { ...STAY, temp_min: 4 } }));
    const by = (n: string) => rules.find((r) => r.item === n);
    expect(by("テント")?.routine).toBe(true);
    expect(by("チェア")?.routine).toBe(true);
    expect(by("防寒着（フリース・ダウン）")?.routine).toBe(false);
    expect(matchGears(rules, []).find((p) => p.item === "テント")?.routine).toBe(true);
  });

  it("寒がりの人は2℃低い前提にする", () => {
    expect(names({ stay: { ...STAY, temp_min: 11 } })).not.toContain("防寒着（フリース・ダウン）");
    expect(names({ stay: { ...STAY, temp_min: 11 }, feelsCold: true })).toContain("防寒着（フリース・ダウン）");
    const r = packingRules(ctx({ stay: { ...STAY, temp_min: 6 }, feelsCold: true }));
    expect(r.find((x) => x.item === "カイロ")?.priority).toBe("must");
  });

  it("季節・クマ・子ども・徒歩", () => {
    expect(names({ month: 12 })).not.toContain("虫よけスプレー");
    expect(names({ bear: true })).toContain("熊鈴・熊よけスプレー");
    expect(names({ companions: "子どもあり" })).toContain("子どもの着替え（多め）");
    expect(names({ transport: "徒歩・公共交通機関" })).not.toContain("クーラーボックス");
  });

  it("マイギアを名前とタグで照らし合わせる（1つのギアは1回だけ）", () => {
    const gears = [
      gear("g1", "OneTigris STELA", ["テント", "ソロキャンプ"]),
      gear("g2", "SOTO ST-340", ["バーナー", "OD缶"]),
      gear("g3", "LED付き充電式ポータブル扇風機", ["扇風機", "充電式"]),
    ];
    const out = matchGears(packingRules(ctx()), gears);
    expect(out.find((p) => p.gear_id === "g1")?.item).toBe("OneTigris STELA");
    // バーナーが先に使うので、ガス缶はマイギアのバーナーとは別に「要準備」のまま
    expect(out.find((p) => p.item === "SOTO ST-340")).toBeDefined();
    expect(out.find((p) => p.item === "ガス缶（OD缶・CB缶）")?.gear_id).toBeNull();
    // 充電式の扇風機をモバイルバッテリー扱いしない
    expect(out.find((p) => p.item === "モバイルバッテリー")?.gear_id).toBeNull();
  });
});

describe("ルールだけの診断", () => {
  it("リスク・持ち物・アドバイスを組み立てる", () => {
    const r = ruleDiagnosis({
      plan: { campsite: "ふもとっぱら", nights: 1, elevation_m: null, terrain: null, ground: null, planned_date: "2026-10-03", expected_low_c: null, expected_high_c: null, transport: "車", companions: "子どもなし", style: null },
      location: { name: "ふもとっぱらキャンプ場", address: "静岡県 富士宮市 麓", lat: 35.4, lon: 138.57, elevation_m: 850 },
      weather: {
        available: true,
        forecast: {
          source: "open-meteo", fetched_at: "", days: [], hours: [],
          stay: { temp_min: 4, temp_max: 18, precip_prob_max: 10, precip_total_mm: 0, wind_max_ms: 2, gust_max_ms: 5 },
        },
      },
      gears: [gear("g1", "OneTigris STELA", ["テント"])],
      experience: null,
      today: "2026-09-30",
    });
    expect(r.environment_risks[0]).toMatchObject({ severity: 4, basis: "forecast" });
    expect(r.bio_site_risks.some((x) => /ツキノワグマ/.test(x.risk))).toBe(true);
    expect(r.packing_list.find((p) => p.gear_id === "g1")).toBeDefined();
    expect(r.overall_advice).toContain("いちばん気を付けたいのは「夜の最低4℃");
    expect(r.overall_advice).toContain("足りないギアが");
  });
});
