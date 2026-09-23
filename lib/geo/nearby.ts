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

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

/** ブラウザから周辺施設を取る。どのサーバーからも取れなければ null */
export async function fetchNearby(kind: NearbyKind, origin: { lat: number; lon: number }): Promise<NearbyPlace[] | null> {
  const body = new URLSearchParams({ data: nearbyQuery(kind, origin.lat, origin.lon) }).toString();
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { elements?: OverpassElement[] };
      return parseNearby(json.elements ?? [], origin);
    } catch {
      // 次のサーバーを試す
    }
  }
  return null;
}
