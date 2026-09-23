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
