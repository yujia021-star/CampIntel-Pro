import type { NearbyKind } from "@/lib/links";

// 周辺施設の候補（OpenStreetMap / Overpass API、© OpenStreetMap contributors、無料）。
// サーバー（Vercel）からは Overpass に届かないことがあるため、スマホのブラウザから直接呼ぶ。
// ここは画面からも使うので、サーバー専用のモジュールを読み込まない。

export interface NearbyPlace {
  name: string;
  lat: number;
  lon: number;
  distance_km: number;
}

/** 種類ごとの OpenStreetMap のタグと探す半径（m） */
export const NEARBY_FILTERS: Record<NearbyKind, { filters: string[]; radius: number }> = {
  onsen: { filters: ['["amenity"="public_bath"]', '["leisure"="spa"]'], radius: 20000 },
  supermarket: { filters: ['["shop"="supermarket"]'], radius: 15000 },
  convenience: { filters: ['["shop"="convenience"]'], radius: 8000 },
  hardware: { filters: ['["shop"~"^(doityourself|hardware)$"]'], radius: 25000 },
  hospital: { filters: ['["amenity"="hospital"]'], radius: 30000 },
  fuel: { filters: ['["amenity"="fuel"]'], radius: 15000 },
  roadside: { filters: ['["name"~"道の駅"]'], radius: 30000 },
  park: { filters: ['["leisure"="playground"]', '["leisure"="park"]'], radius: 10000 },
  cafe: { filters: ['["amenity"="cafe"]'], radius: 15000 },
  sightseeing: { filters: ['["tourism"~"^(viewpoint|attraction)$"]'], radius: 15000 },
};

export function nearbyQuery(kind: NearbyKind, lat: number, lon: number): string {
  const { filters, radius } = NEARBY_FILTERS[kind];
  const at = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const parts = filters.map((f) => `nwr${f}["name"](around:${radius},${at});`).join("");
  return `[out:json][timeout:15];(${parts});out center tags 200;`;
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string | undefined>;
}

/** 近い順に最大 limit 件。同じ名前（チェーン店の重複登録など）は近い方の1件だけ */
export function parseNearby(elements: OverpassElement[], origin: { lat: number; lon: number }, limit = 5): NearbyPlace[] {
  const all: NearbyPlace[] = [];
  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const name = e.tags?.["name:ja"] ?? e.tags?.name;
    if (lat == null || lon == null || !name) continue;
    all.push({ name, lat, lon, distance_km: Math.round(distanceKm(origin, { lat, lon }) * 10) / 10 });
  }
  all.sort((a, b) => a.distance_km - b.distance_km);
  const out: NearbyPlace[] = [];
  for (const p of all) {
    if (out.some((q) => q.name === p.name)) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

// 公開の Overpass サーバーは混雑で断られることがあるので、いくつかに同時に聞いて早く返った方を使う
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export type NearbyResult = { ok: true; places: NearbyPlace[]; source: string } | { ok: false; errors: string[] };

function reason(host: string, e: unknown): string {
  const name = (e as Error)?.name;
  if (name === "TimeoutError" || name === "AbortError") return `${host}: 時間切れ`;
  if (e instanceof HttpError) return `${host}: ${e.status}`;
  return `${host}: 接続できない`;
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function getJson<T>(url: string, timeoutMs: number): Promise<T> {
  // AbortSignal.timeout は古い iPhone の Safari にないので、自前で時間切れにする
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new HttpError(res.status);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** 名前に含まれる言葉で探す種類（Overpass に届かないときに Nominatim で探す） */
const NAME_WORDS: Partial<Record<NearbyKind, string>> = {
  onsen: "温泉",
  roadside: "道の駅",
  hospital: "病院",
  supermarket: "スーパー",
  hardware: "ホームセンター",
  park: "公園",
};

/** Nominatim（OpenStreetMap の検索）で、場所の周り約15kmの範囲を名前の言葉で探す */
function nominatimUrl(word: string, o: { lat: number; lon: number }): string {
  const d = 0.15;
  const params = new URLSearchParams({
    q: word,
    format: "jsonv2",
    limit: "20",
    bounded: "1",
    viewbox: `${o.lon - d},${o.lat + d},${o.lon + d},${o.lat - d}`,
    "accept-language": "ja",
  });
  return `https://nominatim.openstreetmap.org/search?${params}`;
}

/** ブラウザから周辺施設を取る。取れなかったときは、どこでなぜ失敗したかを返す（画面に出して原因を見る） */
export async function fetchNearby(kind: NearbyKind, origin: { lat: number; lon: number }): Promise<NearbyResult> {
  const query = encodeURIComponent(nearbyQuery(kind, origin.lat, origin.lon));
  const errors: string[] = [];
  const attempts = OVERPASS_ENDPOINTS.map(async (url) => {
    const host = new URL(url).host;
    try {
      const json = await getJson<{ elements?: OverpassElement[] }>(`${url}?data=${query}`, 12000);
      return { places: parseNearby(json.elements ?? [], origin), source: host };
    } catch (e) {
      errors.push(reason(host, e));
      throw e;
    }
  });
  try {
    const hit = await Promise.any(attempts);
    return { ok: true, ...hit };
  } catch {
    // すべての Overpass に断られたら、名前で探せる種類だけ Nominatim で探す
  }
  const word = NAME_WORDS[kind];
  if (word) {
    try {
      const items = await getJson<{ lat: string; lon: string; name?: string; display_name?: string }[]>(nominatimUrl(word, origin), 10000);
      const elements = items.map((x) => ({
        lat: Number(x.lat),
        lon: Number(x.lon),
        tags: { name: x.name || x.display_name?.split(",")[0] },
      }));
      return { ok: true, places: parseNearby(elements, origin), source: "nominatim.openstreetmap.org" };
    } catch (e) {
      errors.push(reason("nominatim.openstreetmap.org", e));
    }
  }
  return { ok: false, errors };
}
