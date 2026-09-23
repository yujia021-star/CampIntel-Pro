import { describe, expect, it } from "vitest";
import { forecastAvailability, forecastUrl, parseForecast } from "./forecast";

// 2026-10-10 12:00 から 10-11 12:00 が滞在時間帯
function hourly() {
  const time: string[] = [];
  for (const day of ["2026-10-10", "2026-10-11"]) {
    for (let h = 0; h < 24; h++) time.push(`${day}T${String(h).padStart(2, "0")}:00`);
  }
  return {
    time,
    weather_code: time.map((t) => (t.startsWith("2026-10-10T18") ? 61 : 1)),
    temperature_2m: time.map((_, i) => 20 - (i % 24) / 2), // 0時20℃ → 23時8.5℃
    precipitation_probability: time.map((t) => (t.startsWith("2026-10-10T18") ? 70 : 10)),
    precipitation: time.map((t) => (t.startsWith("2026-10-10T18") ? 1.2 : 0)),
    wind_speed_10m: time.map(() => 3),
    wind_gusts_10m: time.map((t) => (t.startsWith("2026-10-11T03") ? 12.5 : 6)),
  };
}

const json = {
  hourly: hourly(),
  daily: {
    time: ["2026-10-10", "2026-10-11"],
    weather_code: [61, 1],
    temperature_2m_max: [21.04, 19.9],
    temperature_2m_min: [8.46, 7.1],
    precipitation_probability_max: [70, 20],
    precipitation_sum: [1.2, null],
    wind_speed_10m_max: [4, 3.3],
    wind_gusts_10m_max: [9, 12.5],
  },
};

describe("parseForecast", () => {
  const f = parseForecast(json, "2026-10-10", new Date("2026-10-05T00:00:00Z"));

  it("日ごとの天気・気温・降水確率・降水量・風速を個別に持つ", () => {
    expect(f.days[0]).toEqual({
      date: "2026-10-10",
      weather: "弱い雨",
      icon: "🌦️",
      temp_max: 21,
      temp_min: 8.5,
      precip_prob_max: 70,
      precip_sum_mm: 1.2,
      wind_max_ms: 4,
      gust_max_ms: 9,
    });
    expect(f.days[1].precip_sum_mm).toBeNull();
  });

  it("滞在時間帯（12時〜翌12時）を3時間ごとに出す", () => {
    expect(f.hours[0].time).toBe("2026-10-10T12:00");
    expect(f.hours.at(-1)!.time).toBe("2026-10-11T12:00");
    expect(f.hours.map((h) => h.time.slice(11, 13))).toEqual(["12", "15", "18", "21", "00", "03", "06", "09", "12"]);
    expect(f.hours[2]).toMatchObject({ weather: "弱い雨", precip_prob: 70, precip_mm: 1.2 });
  });

  it("滞在時間帯の集計は1時間ごとの全データから出す", () => {
    expect(f.stay).toEqual({
      temp_min: 8.5,
      temp_max: 20,
      precip_prob_max: 70,
      precip_total_mm: 1.2,
      wind_max_ms: 3,
      gust_max_ms: 12.5,
    });
  });

  it("空の応答でも落ちない", () => {
    const empty = parseForecast({}, "2026-10-10");
    expect(empty.days).toEqual([]);
    expect(empty.stay.temp_min).toBeNull();
  });
});

describe("forecastAvailability", () => {
  const now = new Date("2026-09-23T03:00:00Z"); // 日本時間 12:00
  it("予定日がなければ案内を返す", () => {
    expect(forecastAvailability(null, now)?.available).toBe(false);
  });
  it("過去・遠すぎる日は予報なし", () => {
    expect(forecastAvailability("2026-09-22", now)).toMatchObject({ reason: "past" });
    expect(forecastAvailability("2026-10-08", now)).toMatchObject({ reason: "too_far" });
  });
  it("今日〜14日後は取得する", () => {
    expect(forecastAvailability("2026-09-23", now)).toBeNull();
    expect(forecastAvailability("2026-10-07", now)).toBeNull();
  });
});

describe("forecastUrl", () => {
  it("予定日と翌日を日本時間・m/sで取る", () => {
    const u = new URL(forecastUrl(35.4, 138.57, "2026-10-10"));
    expect(u.searchParams.get("start_date")).toBe("2026-10-10");
    expect(u.searchParams.get("end_date")).toBe("2026-10-11");
    expect(u.searchParams.get("timezone")).toBe("Asia/Tokyo");
    expect(u.searchParams.get("wind_speed_unit")).toBe("ms");
  });
});

describe("滞在タイプ（デイ・連泊）", () => {
  it("滞在時間帯", async () => {
    const { stayWindow } = await import("./forecast");
    expect(stayWindow("2026-10-10", 0)).toEqual({ start: "2026-10-10T09:00", end: "2026-10-10T18:00", label: "当日9時〜18時" });
    expect(stayWindow("2026-10-10", 1).label).toBe("初日12時〜翌日12時");
    expect(stayWindow("2026-10-10", 2)).toEqual({ start: "2026-10-10T12:00", end: "2026-10-12T12:00", label: "初日12時〜3日目12時" });
  });

  it("デイキャンプは当日の日中だけを集計する", () => {
    const f = parseForecast(json, "2026-10-10", new Date(), 0);
    expect(f.window).toBe("当日9時〜18時");
    expect(f.hours.map((h) => h.time.slice(11, 13))).toEqual(["09", "12", "15", "18"]);
    // 日中なので夜間の冷え込み（翌朝の最低）は含まない
    expect(f.stay.temp_min).toBe(11);
    expect(f.stay.gust_max_ms).toBe(6);
  });

  it("2泊は最終日まで予報の範囲に入っている必要がある", async () => {
    const { forecastAvailability, clampNights } = await import("./forecast");
    const now = new Date("2026-09-23T03:00:00Z");
    expect(forecastAvailability("2026-10-07", now, 1)).toBeNull();
    expect(forecastAvailability("2026-10-07", now, 2)).toMatchObject({ reason: "too_far" });
    expect(forecastAvailability("2026-10-06", now, 2)).toBeNull();
    expect(forecastAvailability("2026-10-07", now, 0)).toBeNull();
    expect(clampNights("0")).toBe(0);
    expect(clampNights(3)).toBe(1);
    expect(clampNights(undefined)).toBe(1);
  });

  it("URL の終了日は泊数ぶん先", () => {
    expect(new URL(forecastUrl(35, 138, "2026-10-10", 2)).searchParams.get("end_date")).toBe("2026-10-12");
    expect(new URL(forecastUrl(35, 138, "2026-10-10", 0)).searchParams.get("end_date")).toBe("2026-10-10");
  });
});

describe("キャンプ日和の目安", () => {
  const day = (o: Partial<import("./forecast").ForecastDay>) => ({
    date: "2026-10-03",
    weather: "晴れ",
    icon: "☀️",
    temp_max: 22,
    temp_min: 12,
    precip_prob_max: 10,
    precip_sum_mm: 0,
    wind_max_ms: 3,
    gust_max_ms: 7,
    ...o,
  });
  it("雨・風・気温で判定する", async () => {
    const { campDayRating } = await import("./forecast");
    expect(campDayRating(day({})).level).toBe("good");
    expect(campDayRating(day({ precip_prob_max: 50 })).level).toBe("fair");
    expect(campDayRating(day({ precip_prob_max: 80, precip_sum_mm: 12 })).level).toBe("bad");
    expect(campDayRating(day({ gust_max_ms: 16 })).reason).toContain("強風");
    expect(campDayRating(day({ temp_min: -2 })).level).toBe("bad");
  });
});
