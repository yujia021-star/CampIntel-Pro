// キャンプ場・地名の検索と標高の取得（サーバー側で呼ぶ）。
// - キャンプ場などの施設名: OpenStreetMap Nominatim（© OpenStreetMap contributors）
//   利用規約: アプリを識別できる User-Agent を付ける／入力のたびに呼ばない（検索ボタンで1回）
// - 地名・住所: 国土地理院 地名検索API
// - 標高: 国土地理院 標高API

export interface Place {
  id: string;
  name: string;
  /** 都道府県・市区町村などの所在地（候補の見分け用） */
  address: string;
  lat: number;
  lon: number;
  /** 候補の種類（キャンプ場／施設／地名） */
  kind: string;
  source: "osm" | "gsi";
}

const USER_AGENT = "campintel/1.0 (private camping planner; https://camp-intel-pro.vercel.app)";

interface NominatimItem {
  place_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  address?: Record<string, string | undefined>;
}

const CAMP_TYPES = new Set(["camp_site", "caravan_site", "camp_pitch"]);

function nominatimKind(item: NominatimItem): string {
  if (item.type && CAMP_TYPES.has(item.type)) return "キャンプ場";
  if (item.category === "tourism" || item.category === "leisure" || item.category === "amenity") return "施設";
  if (item.category === "natural") return "自然地形";
  return "地名";
}

function nominatimAddress(item: NominatimItem): string {
  const a = item.address ?? {};
  const parts = [
    a.province ?? a.state,
    a.city ?? a.town ?? a.village ?? a.county,
    a.suburb ?? a.quarter ?? a.hamlet,
  ].filter(Boolean);
  if (parts.length) return parts.join(" ");
  // address が無いときは display_name（小さい単位→大きい単位の順）を日本の書き方に並べ替える
  return (item.display_name ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "日本" && !/^\d{3}-?\d{4}$/.test(s))
    .slice(1)
    .reverse()
    .join(" ");
}

export function parseNominatim(items: NominatimItem[]): Place[] {
  return items
    .filter((x) => x.lat && x.lon)
    .map((x) => ({
      id: `osm-${x.place_id ?? `${x.lat},${x.lon}`}`,
      name: x.name || (x.display_name ?? "").split(",")[0]?.trim() || "名称不明",
      address: nominatimAddress(x),
      lat: Number(x.lat),
      lon: Number(x.lon),
      kind: nominatimKind(x),
      source: "osm" as const,
    }));
}

interface GsiItem {
  geometry?: { coordinates?: [number, number] };
  properties?: { title?: string };
}

export function parseGsi(items: GsiItem[]): Place[] {
  return items
    .filter((x) => x.geometry?.coordinates && x.properties?.title)
    .map((x) => {
      const [lon, lat] = x.geometry!.coordinates!;
      const title = x.properties!.title!;
      return { id: `gsi-${lat},${lon}`, name: title, address: title, lat, lon, kind: "地名", source: "gsi" as const };
    });
}

/** 2点間のおおよその距離（km） */
function distanceKm(a: Place, b: Place): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** キャンプ場を先頭に並べ、ほぼ同じ場所（300m以内・同名）の重複を除く */
export function mergePlaces(osm: Place[], gsi: Place[], limit = 8): Place[] {
  const out: Place[] = [];
  const ordered = [...osm.filter((p) => p.kind === "キャンプ場"), ...osm.filter((p) => p.kind !== "キャンプ場"), ...gsi];
  for (const p of ordered) {
    if (out.some((q) => q.name === p.name && distanceKm(p, q) < 0.3)) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
    return (await res.json()) as T;
  } catch (error) {
    console.error("[places]", error);
    return null;
  }
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  const nominatim = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q,
    format: "jsonv2",
    countrycodes: "jp",
    addressdetails: "1",
    "accept-language": "ja",
    limit: "8",
  })}`;
  const gsi = `https://msearch.gsi.go.jp/address-search/AddressSearch?${new URLSearchParams({ q })}`;

  const [osmJson, gsiJson] = await Promise.all([
    getJson<NominatimItem[]>(nominatim, { "User-Agent": USER_AGENT, "Accept-Language": "ja" }),
    getJson<GsiItem[]>(gsi),
  ]);
  return mergePlaces(parseNominatim(osmJson ?? []), parseGsi((gsiJson ?? []).slice(0, 5)));
}

/** 国土地理院の標高（m）。海上・取得できない場所は null */
export async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  const url = `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?${new URLSearchParams({
    lon: String(lon),
    lat: String(lat),
    outtype: "JSON",
  })}`;
  const json = await getJson<{ elevation?: number | string }>(url);
  const v = json?.elevation;
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}
