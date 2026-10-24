import { addDays } from "@/lib/weather/forecast";

// 日の出・日の入りを計算する（NOAA の近似式。誤差は数分。外部APIを使わない）。
// 平らな地平線での時刻なので、山に囲まれたキャンプ場ではこれより早く暗くなる。

const rad = (d: number) => (d * Math.PI) / 180;

/** 日本時間の "H:MM"。極夜・白夜で日の出入りがない日は null */
export function sunTimes(lat: number, lon: number, date: string): { sunrise: string; sunset: string } | null {
  const d = new Date(`${date}T00:00:00Z`);
  const n = Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eqtime =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHa = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
  if (cosHa < -1 || cosHa > 1) return null;
  const ha = (Math.acos(cosHa) * 180) / Math.PI;
  // UTCの分 → 日本時間（+9時間）
  const jst = (utcMin: number) => {
    const m = Math.round(utcMin + 540 + 1440) % 1440;
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  };
  return { sunrise: jst(720 - 4 * (lon + ha) - eqtime), sunset: jst(720 - 4 * (lon - ha) - eqtime) };
}

/** "H:MM" から分を引く */
export function minusMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const t = (h * 60 + m - minutes + 1440) % 1440;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** 滞在の日の入り（初日）と日の出（泊まりなら翌朝） */
export function staySun(
  lat: number,
  lon: number,
  start: string,
  nights: number,
): { sunset: string | null; sunrise: string | null } {
  const first = sunTimes(lat, lon, start);
  const next = nights > 0 ? sunTimes(lat, lon, addDays(start, 1)) : null;
  return { sunset: first?.sunset ?? null, sunrise: nights > 0 ? (next?.sunrise ?? null) : (first?.sunrise ?? null) };
}
