import { z } from "zod";
import type { Place } from "./places";

// OpenStreetMap に載っていないキャンプ場を、AI（Web検索つき）に調べてもらうときの純粋な処理。
// AIの座標はずれることがあるので、AIが答えた住所を国土地理院で検索した地点と突き合わせて使う。

export const AI_PLACE_KIND = "キャンプ場（AI調べ）";

export const CampsiteLookupSchema = z.object({
  candidates: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        address: z.string().trim().max(200).default(""),
        lat: z.coerce.number().nullable().optional(),
        lon: z.coerce.number().nullable().optional(),
      }),
    )
    .default([]),
});
export type CampsiteCandidate = z.infer<typeof CampsiteLookupSchema>["candidates"][number];

/** キャンプ場名らしい入力か（地名だけの入力でAIを呼ばないため） */
export function looksLikeCampsite(query: string): boolean {
  return /キャンプ|野営|グランピング|オートサイト|camp/i.test(query);
}

/** AIの応答文から JSON を取り出して検証する。読めなければ空にする */
export function parseLookupText(text: string): CampsiteCandidate[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = CampsiteLookupSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data.candidates.slice(0, 3) : [];
  } catch {
    return [];
  }
}

const inJapan = (lat: number, lon: number) => lat >= 20 && lat <= 46 && lon >= 122 && lon <= 154;

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * AIの候補を検索候補にする。
 * - 住所から国土地理院で地点が引けたら、AIの座標がその5km以内のときだけAIの座標（施設の位置）を使い、
 *   離れていれば住所の地点を使う（AIの座標の思い違いを防ぐ）
 * - 住所から引けなければ、AIの座標が日本の範囲内のときだけ使う
 */
export function candidateToPlace(c: CampsiteCandidate, geocoded: Place | null): Place | null {
  const ai = c.lat != null && c.lon != null && inJapan(c.lat, c.lon) ? { lat: c.lat, lon: c.lon } : null;
  const point = geocoded ? (ai && distanceKm(ai, geocoded) <= 5 ? ai : { lat: geocoded.lat, lon: geocoded.lon }) : ai;
  if (!point) return null;
  return {
    id: `ai-${point.lat.toFixed(4)},${point.lon.toFixed(4)}`,
    name: c.name,
    address: c.address || geocoded?.address || "",
    lat: point.lat,
    lon: point.lon,
    kind: AI_PLACE_KIND,
    source: "ai",
  };
}
