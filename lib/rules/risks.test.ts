import { describe, expect, it } from "vitest";
import { prefectureOf, regionRisks, roadRisks, siteRisks, weatherRisks } from "./risks";

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
    // 雷・雪・凍結・霧は天気の種類から
    expect(weatherRisks(stay(), 1, ["雷雨"])[0]).toMatchObject({ severity: 4, risk: expect.stringContaining("雷") });
    expect(weatherRisks(stay(), 1, ["大雪", "雪"]).map((r) => r.severity)).toEqual([5]);
    expect(weatherRisks(stay(), 1, ["霧"])[0].severity).toBe(2);
    expect(weatherRisks(stay(), 1, ["晴れ", "曇り"])).toEqual([]);
    // デイキャンプは夜の冷え込み（最低15℃以下の注意）を出さない
    expect(weatherRisks(stay({ temp_min: 14 }), 0)).toEqual([]);
  });
});

describe("季節・地域のリスク", () => {
  const site = (o: Partial<Parameters<typeof regionRisks>[0]> = {}) => ({
    month: 10,
    prefecture: "静岡県",
    elevation_m: 850,
    nights: 1,
    transport: "車",
    companions: "子どもなし",
    ...o,
  });

  it("住所から都道府県を取り出す", () => {
    expect(prefectureOf("静岡県 富士宮市 麓")).toBe("静岡県");
    expect(prefectureOf("神奈川県茅ヶ崎市柳島")).toBe("神奈川県");
    expect(prefectureOf("ふもとっぱら")).toBeNull();
  });

  it("クマは生息域・標高・冬眠の時期で決まる", () => {
    const bear = (o: Partial<Parameters<typeof regionRisks>[0]>) => regionRisks(site(o)).find((r) => /クマ|グマ/.test(r.risk));
    expect(bear({})).toMatchObject({ severity: 3, basis: "season_region" });
    expect(bear({ prefecture: "北海道" })?.severity).toBe(4);
    expect(bear({ month: 1 })).toBeUndefined();
    expect(bear({ prefecture: "千葉県" })).toBeUndefined();
    // 生息域でも標高の低い所は出さない（出没の多い地域は除く）
    expect(bear({ prefecture: "神奈川県", elevation_m: 5 })).toBeUndefined();
    expect(bear({ prefecture: "秋田県", elevation_m: 5 })?.severity).toBe(3);
  });

  it("虫とハチは季節で出す", () => {
    expect(regionRisks(site({ month: 8 })).map((r) => r.risk).join()).toContain("蚊・ブヨ・マダニ");
    expect(regionRisks(site({ month: 4 })).map((r) => r.risk).join()).not.toContain("スズメバチ");
    expect(regionRisks(site({ month: 12, prefecture: "沖縄県" }))).toEqual([]);
  });

  it("標高・徒歩・子ども連れ", () => {
    expect(siteRisks(site({ elevation_m: 1200 }))[0]).toMatchObject({ basis: "terrain" });
    expect(siteRisks(site({ transport: "徒歩・公共交通機関" }))[0].risk).toContain("荷物は軽く");
    expect(siteRisks(site({ transport: "徒歩・公共交通機関", nights: 0 }))).toEqual([]);
    expect(siteRisks(site({ companions: "子どもあり" }))[0].risk).toContain("子ども連れ");
    expect(siteRisks(site({}))).toEqual([]);
  });
});

describe("予報の変化", () => {
  it("目安以上に変わった項目だけを出す", async () => {
    const { forecastChanges } = await import("@/components/ForecastRecheck");
    const s = stay({ precip_prob_max: 40, temp_min: 10 });
    expect(forecastChanges(s, { ...s, precip_prob_max: 90, temp_min: 11 })).toEqual([{ label: "降水確率", from: "40%", to: "90%" }]);
    expect(forecastChanges(s, s)).toEqual([]);
  });
});

describe("行き帰りの路面凍結", () => {
  it("気温と雨・雪で危険度が上がる", () => {
    expect(roadRisks({ minTemp: 5, wet: false, transport: "車" })).toEqual([]);
    expect(roadRisks({ minTemp: 2.5, wet: false, transport: "車" })[0].severity).toBe(2);
    expect(roadRisks({ minTemp: -1, wet: false, transport: "車" })[0].severity).toBe(3);
    expect(roadRisks({ minTemp: -1, wet: true, transport: "車" })[0]).toMatchObject({ severity: 4, basis: "forecast" });
  });

  it("徒歩・公共交通機関や移動手段が分からないときは出さない", () => {
    expect(roadRisks({ minTemp: -3, wet: true, transport: "徒歩・公共交通機関" })).toEqual([]);
    expect(roadRisks({ minTemp: -3, wet: true, transport: null })).toEqual([]);
  });
});
