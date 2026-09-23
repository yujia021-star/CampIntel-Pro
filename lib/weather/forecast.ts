import { weatherLabel } from "./codes";

// 天気予報（Open-Meteo, https://open-meteo.com/ ）。APIキー不要・非商用無料・CC BY 4.0。
// キャンプは1泊を想定し、予定日の昼〜翌日の昼を「滞在時間帯」として扱う。

export const FORECAST_MAX_DAYS = 16;

export interface ForecastDay {
  date: string;
  weather: string;
  icon: string;
  temp_max: number | null;
  temp_min: number | null;
  precip_prob_max: number | null;
  precip_sum_mm: number | null;
  wind_max_ms: number | null;
  gust_max_ms: number | null;
}

export interface ForecastHour {
  time: string; // "2026-10-10T15:00"
  weather: string;
  icon: string;
  temp: number | null;
  precip_prob: number | null;
  precip_mm: number | null;
  wind_ms: number | null;
  gust_ms: number | null;
}

export interface Forecast {
  source: "open-meteo";
  fetched_at: string;
  days: ForecastDay[];
  /** 滞在時間帯（予定日12時〜翌日12時）を3時間ごと */
  hours: ForecastHour[];
  /** 滞在時間帯の集計（リスク判断とプロンプト用） */
  stay: {
    temp_min: number | null;
    temp_max: number | null;
    precip_prob_max: number | null;
    precip_total_mm: number | null;
    wind_max_ms: number | null;
    gust_max_ms: number | null;
  };
}

export type ForecastResult =
  | { available: true; forecast: Forecast }
  | { available: false; reason: "no_date" | "past" | "too_far" | "error"; message: string };

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 今日（日本時間）の日付 */
export function todayJst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 予定日に予報を出せるかを判定する */
export function forecastAvailability(date: string | null, now = new Date()): ForecastResult | null {
  if (!date) return { available: false, reason: "no_date", message: "予定日を入れると天気予報を表示します。" };
  const today = todayJst(now);
  if (date < today) return { available: false, reason: "past", message: "予定日が過去のため、予報はありません。" };
  if (date > addDays(today, FORECAST_MAX_DAYS - 2)) {
    return {
      available: false,
      reason: "too_far",
      message: `天気予報は${FORECAST_MAX_DAYS - 2}日先までです。近づいたらもう一度診断してください。`,
    };
  }
  return null;
}

export function forecastUrl(lat: number, lon: number, date: string): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: "weather_code,temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max",
    timezone: "Asia/Tokyo",
    wind_speed_unit: "ms",
    start_date: date,
    end_date: addDays(date, 1),
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

type Num = number | null | undefined;
const num = (v: Num): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

function maxOf(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v !== null);
  return xs.length ? Math.max(...xs) : null;
}
function minOf(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v !== null);
  return xs.length ? Math.min(...xs) : null;
}

interface OpenMeteoResponse {
  hourly?: {
    time?: string[];
    weather_code?: Num[];
    temperature_2m?: Num[];
    precipitation_probability?: Num[];
    precipitation?: Num[];
    wind_speed_10m?: Num[];
    wind_gusts_10m?: Num[];
  };
  daily?: {
    time?: string[];
    weather_code?: Num[];
    temperature_2m_max?: Num[];
    temperature_2m_min?: Num[];
    precipitation_probability_max?: Num[];
    precipitation_sum?: Num[];
    wind_speed_10m_max?: Num[];
    wind_gusts_10m_max?: Num[];
  };
}

/** Open-Meteo の応答を画面・プロンプト用の形にする */
export function parseForecast(json: OpenMeteoResponse, date: string, fetchedAt = new Date()): Forecast {
  const d = json.daily ?? {};
  const days: ForecastDay[] = (d.time ?? []).map((t, i) => {
    const w = weatherLabel(num(d.weather_code?.[i]));
    return {
      date: t,
      weather: w.label,
      icon: w.icon,
      temp_max: round1(num(d.temperature_2m_max?.[i])),
      temp_min: round1(num(d.temperature_2m_min?.[i])),
      precip_prob_max: num(d.precipitation_probability_max?.[i]),
      precip_sum_mm: round1(num(d.precipitation_sum?.[i])),
      wind_max_ms: round1(num(d.wind_speed_10m_max?.[i])),
      gust_max_ms: round1(num(d.wind_gusts_10m_max?.[i])),
    };
  });

  const h = json.hourly ?? {};
  const start = `${date}T12:00`;
  const end = `${addDays(date, 1)}T12:00`;
  const stayHours: ForecastHour[] = [];
  (h.time ?? []).forEach((t, i) => {
    if (t < start || t > end) return;
    const w = weatherLabel(num(h.weather_code?.[i]));
    stayHours.push({
      time: t,
      weather: w.label,
      icon: w.icon,
      temp: round1(num(h.temperature_2m?.[i])),
      precip_prob: num(h.precipitation_probability?.[i]),
      precip_mm: round1(num(h.precipitation?.[i])),
      wind_ms: round1(num(h.wind_speed_10m?.[i])),
      gust_ms: round1(num(h.wind_gusts_10m?.[i])),
    });
  });

  const precipTotal = stayHours.reduce<number | null>(
    (sum, x) => (x.precip_mm === null ? sum : (sum ?? 0) + x.precip_mm),
    null,
  );

  return {
    source: "open-meteo",
    fetched_at: fetchedAt.toISOString(),
    days,
    // 画面では3時間ごとに間引く（集計は1時間ごとの全データで行う）
    hours: stayHours.filter((x) => Number(x.time.slice(11, 13)) % 3 === 0),
    stay: {
      temp_min: minOf(stayHours.map((x) => x.temp)),
      temp_max: maxOf(stayHours.map((x) => x.temp)),
      precip_prob_max: maxOf(stayHours.map((x) => x.precip_prob)),
      precip_total_mm: round1(precipTotal),
      wind_max_ms: maxOf(stayHours.map((x) => x.wind_ms)),
      gust_max_ms: maxOf(stayHours.map((x) => x.gust_ms)),
    },
  };
}

/** 予報を取得する（サーバー側で呼ぶ） */
export async function fetchForecast(lat: number, lon: number, date: string | null): Promise<ForecastResult> {
  const unavailable = forecastAvailability(date);
  if (unavailable) return unavailable;
  try {
    const res = await fetch(forecastUrl(lat, lon, date!), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    return { available: true, forecast: parseForecast(await res.json(), date!) };
  } catch (error) {
    console.error("[forecast]", error);
    return { available: false, reason: "error", message: "天気予報を取得できませんでした。時間をおいてお試しください。" };
  }
}
