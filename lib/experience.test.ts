import { describe, expect, it } from "vitest";
import { addMonths, computeExperience, feelTendency, tripConditions, windowIndex, type Trip } from "./experience";

const trip = (date: string, o: Partial<Trip> = {}): Trip => ({
  date,
  nights: 1,
  weather: "晴れ",
  temp_feel: "ちょうどいい",
  forecast_min: 12,
  ...o,
});
const TODAY = "2026-09-23";

describe("経験レベル", () => {
  it("月末をまたいでも月の計算がずれない", () => {
    expect(addMonths("2026-05-31", -3)).toBe("2026-02-28");
    expect(addMonths("2026-09-23", -12)).toBe("2025-09-23");
  });

  it("直近12か月を3か月ずつ4区間に分ける", () => {
    expect(windowIndex("2026-09-23", TODAY)).toBe(0);
    expect(windowIndex("2026-06-24", TODAY)).toBe(0);
    expect(windowIndex("2026-06-23", TODAY)).toBe(1);
    expect(windowIndex("2025-09-24", TODAY)).toBe(3);
    expect(windowIndex("2025-09-23", TODAY)).toBeNull();
    expect(windowIndex("2026-10-01", TODAY)).toBeNull();
  });

  it("条件は予報の数値で、予報がなければ体感で判断する", () => {
    expect(tripConditions(trip("2026-01-10", { forecast_min: 3 }))).toEqual(["cold"]);
    expect(tripConditions(trip("2026-08-10", { forecast_min: 25, weather: "雨", nights: 2 }))).toEqual(["rain", "tropical", "multi"]);
    expect(tripConditions(trip("2026-08-10", { forecast_min: null, temp_feel: "暑すぎ" }))).toEqual(["tropical"]);
    // 予報があるときは体感より予報を優先（寒すぎと感じても予報12℃なら寒い夜ではない）
    expect(tripConditions(trip("2026-01-10", { forecast_min: 12, temp_feel: "寒すぎ" }))).toEqual([]);
  });

  it("デイキャンプは数えない", () => {
    const e = computeExperience([trip("2026-09-01", { nights: 0 })], null, TODAY);
    expect(e).toMatchObject({ level: "first", nights: 0 });
  });

  it("ベテランは量・幅・鮮度のすべて。鮮度だけ足りなければブランクのある中級", () => {
    const trips = [
      trip("2026-09-01", { nights: 2, weather: "雨" }),
      trip("2026-06-01", { forecast_min: 26 }),
      trip("2026-02-01", { forecast_min: 1, nights: 2 }),
      trip("2025-11-01", { nights: 2 }),
      trip("2024-05-01", { nights: 3 }),
    ];
    const vet = computeExperience(trips, null, TODAY);
    expect(vet).toMatchObject({ level: "veteran", nights: 10, blank: false });
    expect(vet.conditions).toEqual(["rain", "cold", "tropical", "multi"]);

    // 夏に4回まとめて行っても、鮮度は4区間のうち1つだけ
    const summer = computeExperience(
      [...trips.slice(0, 1), trip("2026-08-01", { forecast_min: 26 }), trip("2026-08-15", { forecast_min: 1, nights: 2 }), trip("2026-07-01", { nights: 5 })],
      null,
      TODAY,
    );
    expect(summer.windows).toEqual([true, false, false, false]);
    expect(summer).toMatchObject({ level: "intermediate", blank: true });
    expect(summer.next.join()).toContain("4区間中1区間");
  });

  it("自己申告を足して判定し、申告した時期は時間がたつと外れる", () => {
    const report = { prior_nights: "10+" as const, conditions: ["rain" as const, "cold" as const, "multi" as const], windows: [0, 1, 2, 3], reported_at: TODAY };
    expect(computeExperience([], report, TODAY)).toMatchObject({ level: "veteran", nights: 10, reported: true });
    // 半年後: 申告した区間のうち新しい2つだけが直近12か月に残る
    const later = computeExperience([], report, "2027-03-23");
    expect(later.windows).toEqual([false, false, true, true]);
    expect(later).toMatchObject({ level: "intermediate", blank: true });
  });

  it("ビギナーには中級までに足りないことを出す", () => {
    const e = computeExperience([trip("2026-09-01")], null, TODAY);
    expect(e.level).toBe("beginner");
    expect(e.next[0]).toBe("あと4泊");
  });
});

describe("体感のクセ", () => {
  it("予報とひも付いた泊まりの日記が3件以上で出す", () => {
    const cold = [1, 2, 3].map((i) => trip(`2026-0${i}-01`, { temp_feel: "寒すぎ", forecast_min: 6 + i }));
    expect(feelTendency(cold.slice(0, 2))).toBeNull();
    expect(feelTendency(cold)).toMatchObject({ kind: "cold", detail: "3回中3回「寒すぎ」（そのときの予報の最低気温は平均8℃）" });
    // 予報のない日記・デイキャンプは数えない
    expect(feelTendency([...cold.slice(0, 2), trip("2026-04-01", { forecast_min: null }), trip("2026-05-01", { nights: 0 })])).toBeNull();
    expect(feelTendency([trip("2026-01-01"), trip("2026-02-01"), trip("2026-03-01", { temp_feel: "寒すぎ" })])?.kind).toBe("neutral");
  });
});
