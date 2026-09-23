import type { DiagnosisResult, Risk } from "@/lib/domain";
import type { Forecast } from "@/lib/weather/forecast";

// 診断のたびに結果がぶれないようにする仕組み（純粋な計算）。
// - 天気（雨・風・気温）のリスクは、予報の数字から決まったルールで出す（AIに危険度を付けさせない）
// - 季節・地域の一般的傾向（クマ・ハチ・虫など）は、同じ場所・同じ月なら前回の診断のものを使う

const RAIN_EXTREME_MM = 50;

/**
 * 予報の数字から天気のリスクを出す。危険度の目安はプロンプト（DIAGNOSIS_SYSTEM）と同じ。
 * 数字だけでは分からない雷・雪・凍結・霧は、滞在中の天気（labels: 「雷雨」「大雪」など）から出す。
 */
export function weatherRisks(stay: Forecast["stay"], nights: number, labels: string[] = []): Risk[] {
  const out: Risk[] = [];
  const has = (re: RegExp) => labels.some((l) => re.test(l));
  if (has(/雷/)) out.push({ risk: "雷雨の予報。落雷に備え、車や建物にすぐ避難できるように", severity: 4, basis: "forecast" });
  if (has(/大雪|強いにわか雪/)) out.push({ risk: "大雪の予報。道路の通行止めやテントの積雪に注意", severity: 5, basis: "forecast" });
  else if (has(/雪/)) out.push({ risk: "雪の予報。スタッドレスタイヤ・チェーンと雪対策を", severity: 4, basis: "forecast" });
  if (has(/着氷/)) out.push({ risk: "着氷性の雨・霧の予報。路面やテントの凍結に注意", severity: 4, basis: "forecast" });
  else if (has(/^霧$/)) out.push({ risk: "霧の予報。視界が悪くなるので運転と夜の移動に注意", severity: 2, basis: "forecast" });
  const p = stay.precip_prob_max;
  const mm = stay.precip_total_mm ?? 0;
  if (p !== null) {
    const sev = mm >= RAIN_EXTREME_MM ? 5 : p >= 70 && mm >= 10 ? 4 : (p >= 50 && mm >= 3) || p >= 70 ? 3 : p >= 30 ? 2 : 0;
    if (sev) out.push({ risk: `降水確率最大${p}%・合計${mm}mm。撤収時の濡れや浸水に備える`, severity: sev, basis: "forecast" });
  }
  const g = stay.gust_max_ms;
  const w = stay.wind_max_ms;
  if (g !== null || w !== null) {
    const gust = g ?? 0;
    const wind = w ?? 0;
    const sev = gust >= 20 ? 5 : gust >= 15 || wind >= 10 ? 4 : gust >= 10 || wind >= 6 ? 3 : gust >= 7 ? 2 : 0;
    if (sev) out.push({ risk: `最大瞬間風速${gust}m/s。タープ・テントの張り綱とペグをしっかり`, severity: sev, basis: "forecast" });
  }
  const min = stay.temp_min;
  if (min !== null) {
    const sev = min <= -5 ? 5 : min <= 5 ? 4 : min <= 10 ? 3 : min <= 15 && nights > 0 ? 2 : 0;
    if (sev) {
      const text = nights > 0 ? `夜の最低${min}℃。寝袋・マット・防寒着で冷え込み対策を` : `最低${min}℃。防寒着を用意する`;
      out.push({ risk: text, severity: sev, basis: "forecast" });
    }
    if (nights > 0 && min >= 25) out.push({ risk: `夜も${min}℃の熱帯夜。寝苦しさと熱中症に注意`, severity: 3, basis: "forecast" });
  }
  const max = stay.temp_max;
  if (max !== null) {
    const sev = max >= 35 ? 4 : max >= 30 ? 3 : max >= 27 ? 2 : 0;
    if (sev) out.push({ risk: `最高${max}℃。熱中症・日差し対策を`, severity: sev, basis: "forecast" });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

export interface RegionRisks {
  environment: Risk[];
  bio: Risk[];
}

/** 同じ場所とみなす距離（km） */
export const SAME_PLACE_KM = 3;

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** 予定日の月（"10"）。季節は年をまたいでも同じなので年は見ない。予定日がなければ today の月 */
export function planMonth(plannedDate: string | null, today: string): string {
  return (plannedDate ?? today).slice(5, 7);
}

/** 以前の診断（新しい順）から、同じ場所（3km以内）・同じ月の「季節・地域の一般的傾向」のリスクを探す */
export function pickRegionRisks(
  previous: { planned_date: string | null; created_at: string; result: DiagnosisResult | null }[],
  place: { lat: number; lon: number },
  month: string,
): RegionRisks | null {
  for (const p of previous) {
    const loc = p.result?.location;
    if (!loc || !p.result) continue;
    if (planMonth(p.planned_date, p.created_at.slice(0, 10)) !== month) continue;
    if (distanceKm(loc, place) > SAME_PLACE_KM) continue;
    const pick = (rs: Risk[]) => rs.filter((r) => r.basis === "season_region");
    const region = { environment: pick(p.result.environment_risks), bio: pick(p.result.bio_site_risks) };
    if (region.environment.length || region.bio.length) return region;
  }
  return null;
}

/**
 * AIのリスクに、決まったリスクを差し込む。
 * 天気のリスクがあれば AI の天気（basis=forecast）のリスクと置き換え、
 * 地域のリスクがあれば AI の季節・地域のリスクと置き換える。
 */
export function applyStableRisks(
  lists: { environment: Risk[]; bio: Risk[] },
  fixed: { weather?: Risk[] | null; region?: RegionRisks | null },
): { environment: Risk[]; bio: Risk[] } {
  let environment = lists.environment;
  let bio = lists.bio;
  if (fixed.weather) {
    environment = [...fixed.weather, ...environment.filter((r) => r.basis !== "forecast")];
    bio = bio.filter((r) => r.basis !== "forecast");
  }
  if (fixed.region) {
    environment = [...environment.filter((r) => r.basis !== "season_region"), ...fixed.region.environment];
    bio = [...fixed.region.bio, ...bio.filter((r) => r.basis !== "season_region")];
  }
  return { environment, bio };
}

/** 決まった順でJSON文字列にする（同じ内容なら同じ文字列になる） */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
