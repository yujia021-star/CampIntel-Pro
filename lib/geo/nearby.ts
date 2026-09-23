import type { NearbyKind } from "@/lib/links";
import { distanceKm, fetchOverpass, type OverpassElement } from "./places";

// キャンプ場の周辺施設（OpenStreetMap / Overpass API、© OpenStreetMap contributors）

export interface NearbyPlace {
  kind: NearbyKind;
  name: string;
  lat: number;
  lon: number;
  distance_km: number;
}

/** 種類ごとの OpenStreetMap のタグと探す半径（m） */
const FILTERS: { kind: NearbyKind; filter: string; radius: number }[] = [
  { kind: "onsen", filter: '["amenity"="public_bath"]', radius: 15000 },
  { kind: "supermarket", filter: '["shop"="supermarket"]', radius: 15000 },
  { kind: "convenience", filter: '["shop"="convenience"]', radius: 8000 },
  { kind: "hardware", filter: '["shop"~"^(doityourself|hardware)$"]', radius: 20000 },
  { kind: "hospital", filter: '["amenity"="hospital"]', radius: 25000 },
  { kind: "fuel", filter: '["amenity"="fuel"]', radius: 15000 },
];

export function nearbyQuery(lat: number, lon: number): string {
  const parts = FILTERS.map((f) => `nwr${f.filter}["name"](around:${f.radius},${lat.toFixed(5)},${lon.toFixed(5)});`);
  return `[out:json][timeout:12];(${parts.join("")});out center tags 300;`;
}

function kindOf(tags: Record<string, string | undefined>): NearbyKind | null {
  if (tags.amenity === "public_bath") return "onsen";
  if (tags.shop === "supermarket") return "supermarket";
  if (tags.shop === "convenience") return "convenience";
  if (tags.shop === "doityourself" || tags.shop === "hardware") return "hardware";
  if (tags.amenity === "hospital") return "hospital";
  if (tags.amenity === "fuel") return "fuel";
  return null;
}

/** 種類ごとに近い順で最大 perKind 件にする */
export function parseNearby(elements: OverpassElement[], origin: { lat: number; lon: number }, perKind = 3): NearbyPlace[] {
  const all: NearbyPlace[] = [];
  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const tags = e.tags ?? {};
    const kind = kindOf(tags);
    const name = tags["name:ja"] ?? tags.name;
    if (lat == null || lon == null || !kind || !name) continue;
    const d = distanceKm(origin, { lat, lon });
    all.push({ kind, name, lat, lon, distance_km: Math.round(d * 10) / 10 });
  }
  all.sort((a, b) => a.distance_km - b.distance_km);
  const out: NearbyPlace[] = [];
  const count = new Map<NearbyKind, number>();
  for (const p of all) {
    const n = count.get(p.kind) ?? 0;
    // 同じ名前（チェーン店の重複登録など）は1件に
    if (n >= perKind || out.some((q) => q.kind === p.kind && q.name === p.name)) continue;
    count.set(p.kind, n + 1);
    out.push(p);
  }
  return out;
}

/** 周辺施設を取得する。取れなければ null（画面は地図アプリへのリンクだけにする） */
export async function fetchNearby(lat: number, lon: number): Promise<NearbyPlace[] | null> {
  const json = await fetchOverpass(nearbyQuery(lat, lon));
  return json ? parseNearby(json.elements ?? [], { lat, lon }) : null;
}
