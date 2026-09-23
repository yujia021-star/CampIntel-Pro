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
    all.push({ name: displayName(name), lat, lon, distance_km: Math.round(distanceKm(origin, { lat, lon }) * 10) / 10 });
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

export type NearbyResult =
  | { ok: true; places: NearbyPlace[]; source: string; errors: string[] }
  | { ok: false; errors: string[] };

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

/**
 * Overpass に届かないときに Nominatim で探す言葉と、受け入れる施設の種類（category:type。"*" は category 全部）。
 * 言葉は「名前に入る日本語」と「種類を表す英語の定型句（Nominatim が種類として解釈する）」の両方で探す。
 * 名前だけだと「下部温泉病院」「〇〇温泉駐車場」まで当たるので、種類で絞る。
 */
const NAME_SEARCH: Partial<Record<NearbyKind, { queries: string[]; types: string[] }>> = {
  onsen: { queries: ["温泉", "public bath"], types: ["amenity:public_bath", "leisure:spa", "natural:hot_spring", "leisure:sauna"] },
  roadside: { queries: ["道の駅"], types: ["highway:services", "highway:rest_area", "amenity:marketplace", "shop:*", "tourism:information", "tourism:attraction"] },
  hospital: { queries: ["病院", "hospital"], types: ["amenity:hospital", "amenity:clinic", "healthcare:*"] },
  supermarket: { queries: ["スーパー", "supermarket"], types: ["shop:supermarket"] },
  hardware: { queries: ["ホームセンター", "hardware store", "DIY store"], types: ["shop:doityourself", "shop:hardware"] },
  park: { queries: ["公園", "playground"], types: ["leisure:park", "leisure:playground"] },
  convenience: { queries: ["convenience store", "コンビニ"], types: ["shop:convenience"] },
  fuel: { queries: ["fuel station", "ガソリンスタンド"], types: ["amenity:fuel"] },
  cafe: { queries: ["cafe", "カフェ"], types: ["amenity:cafe"] },
  sightseeing: { queries: ["viewpoint", "展望"], types: ["tourism:viewpoint", "tourism:attraction"] },
};

interface NominatimItem {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
}

/** Nominatim の結果を、その種類の施設だけに絞る */
export function filterNominatim(items: NominatimItem[], types: string[]): NominatimItem[] {
  return items.filter((x) => types.some((t) => t === `${x.category}:${x.type}` || t === `${x.category}:*`));
}

/** 「あさぎり温泉;風の湯」のように複数の名前が入っていたら見やすくする */
export function displayName(name: string): string {
  return name
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" / ");
}

/** Nominatim（OpenStreetMap の検索）で、場所の周り約15kmの範囲を名前の言葉で探す */
function nominatimUrl(word: string, o: { lat: number; lon: number }): string {
  const d = 0.15;
  const params = new URLSearchParams({
    q: word,
    addressdetails: "0",
    format: "jsonv2",
    limit: "20",
    bounded: "1",
    viewbox: `${o.lon - d},${o.lat + d},${o.lon + d},${o.lat - d}`,
    "accept-language": "ja",
  });
  return `https://nominatim.openstreetmap.org/search?${params}`;
}

async function searchNominatim(kind: NearbyKind, origin: { lat: number; lon: number }): Promise<NearbyPlace[]> {
  const search = NAME_SEARCH[kind];
  if (!search) throw new Error("no name search");
  const lists = await Promise.allSettled(search.queries.map((q) => getJson<NominatimItem[]>(nominatimUrl(q, origin), 10000)));
  const ok = lists.filter((r): r is PromiseFulfilledResult<NominatimItem[]> => r.status === "fulfilled");
  if (!ok.length) throw (lists[0] as PromiseRejectedResult).reason;
  const items = filterNominatim(ok.flatMap((r) => r.value), search.types);
  return parseNearby(
    items.map((x) => ({ lat: Number(x.lat), lon: Number(x.lon), tags: { name: x.name || x.display_name?.split(",")[0] } })),
    origin,
  );
}

/**
 * ブラウザから周辺施設を取る。Overpass（種類で正確に探せる）と Nominatim（名前・定型句で探す）を同時に始め、
 * Overpass が返せばそれを、だめなら Nominatim を使う。取れなかったときは、どこでなぜ失敗したかを返す。
 */
export async function fetchNearby(kind: NearbyKind, origin: { lat: number; lon: number }): Promise<NearbyResult> {
  const query = encodeURIComponent(nearbyQuery(kind, origin.lat, origin.lon));
  const errors: string[] = [];
  const nominatim = NAME_SEARCH[kind] ? searchNominatim(kind, origin) : null;
  nominatim?.catch(() => {}); // Overpass が返したときに未処理エラーにしない
  const attempts = OVERPASS_ENDPOINTS.map(async (url) => {
    const host = new URL(url).host;
    try {
      const json = await getJson<{ elements?: OverpassElement[] }>(`${url}?data=${query}`, 10000);
      return { places: parseNearby(json.elements ?? [], origin), source: host };
    } catch (e) {
      errors.push(reason(host, e));
      throw e;
    }
  });
  try {
    const hit = await Promise.any(attempts);
    return { ok: true, ...hit, errors: [] };
  } catch {
    // すべての Overpass に断られた
  }
  if (nominatim) {
    try {
      return { ok: true, places: await nominatim, source: "nominatim.openstreetmap.org", errors };
    } catch (e) {
      errors.push(reason("nominatim.openstreetmap.org", e));
    }
  }
  return { ok: false, errors };
}
