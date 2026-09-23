// キャンプ場・地名の検索と標高の取得（サーバー側で呼ぶ）。
// - キャンプ場などの施設名（いずれも OpenStreetMap のデータ、© OpenStreetMap contributors）
//   - Overpass API: 「キャンプ場」タグの付いた場所だけを名前で探す（キャンプ場名に強い）
//   - Photon: あいまいな名前検索
//   - Nominatim: 住所・施設の総合検索
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
  source: "osm" | "gsi" | "ai";
  /** 場所を選ばずに診断したとき、名前から自動で選んだ場所か */
  auto?: boolean;
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

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    state?: string;
    city?: string;
    county?: string;
    district?: string;
    locality?: string;
  };
}

export function parsePhoton(features: PhotonFeature[]): Place[] {
  return features
    .filter((f) => f.geometry?.coordinates && f.properties?.name)
    .map((f) => {
      const [lon, lat] = f.geometry!.coordinates!;
      const p = f.properties!;
      const kind =
        p.osm_value && CAMP_TYPES.has(p.osm_value)
          ? "キャンプ場"
          : p.osm_key === "tourism" || p.osm_key === "leisure" || p.osm_key === "amenity"
            ? "施設"
            : "地名";
      return {
        id: `photon-${p.osm_id ?? `${lat},${lon}`}`,
        name: p.name!,
        address: [p.state, p.city ?? p.county, p.district ?? p.locality].filter(Boolean).join(" "),
        lat,
        lon,
        kind,
        source: "osm" as const,
      };
    });
}

interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string | undefined>;
}

export function parseOverpass(elements: OverpassElement[]): Place[] {
  return elements
    .map((e) => ({ e, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon }))
    .filter(({ e, lat, lon }) => lat != null && lon != null && e.tags?.name)
    .map(({ e, lat, lon }) => {
      const t = e.tags!;
      return {
        id: `osm-${e.type}-${e.id}`,
        name: t["name:ja"] ?? t.name!,
        address: [t["addr:province"] ?? t["addr:state"], t["addr:city"], t["addr:quarter"] ?? t["addr:suburb"]]
          .filter(Boolean)
          .join(" "),
        lat: lat!,
        lon: lon!,
        kind: "キャンプ場",
        source: "osm" as const,
      };
    });
}

/**
 * 「柳島キャンプ場」→「柳島」のように、キャンプ場を表す語を除いた名前の核を取り出す。
 * キャンプ場タグで絞り込んでから名前で探すので、核だけで十分に当たる。
 */
export function campsiteCore(query: string): string | null {
  const core = query
    .replace(/\s+/g, "")
    .replace(/(オート)?(キャンプ(場|サイト|フィールド|グラウンド|村|ベース)?|野営場|グランピング(場)?)$/, "")
    .trim();
  return core.length >= 2 ? core : null;
}

/** Overpass の正規表現で特別な意味を持つ文字をエスケープする */
function escapeOverpassRegex(text: string): string {
  return text.replace(/[\\.*+?^$(){}|[\]"]/g, "\\$&");
}

export function overpassQuery(core: string): string {
  // 日本全体の範囲で、キャンプ場タグのある場所だけを名前（部分一致）で探す
  const name = escapeOverpassRegex(core);
  return `[out:json][timeout:8];nwr["tourism"~"^(camp_site|caravan_site)$"]["name"~"${name}"](20,122,46,154);out center tags 10;`;
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

async function getJson<T>(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 6000,
  init: { method?: string; body?: string } = {},
): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
    return (await res.json()) as T;
  } catch (error) {
    console.error("[places]", error);
    return null;
  }
}

// 本家が混んでいるときに備えて、ミラーを順に試す
const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

async function fetchOverpass(query: string, headers: Record<string, string>) {
  for (const url of OVERPASS_ENDPOINTS) {
    // 長い問い合わせでも弾かれないよう POST で送る
    const json = await getJson<{ elements?: OverpassElement[] }>(
      url,
      { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      7000,
      { method: "POST", body: new URLSearchParams({ data: query }).toString() },
    );
    if (json) return json;
  }
  return null;
}

/** 名前・住所から国土地理院の地名検索でいちばん当てはまる地点を探す */
export async function geocodeAddress(address: string): Promise<Place | null> {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?${new URLSearchParams({ q: address })}`;
  return parseGsi((await getJson<GsiItem[]>(url)) ?? [])[0] ?? null;
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  const core = campsiteCore(q);
  const nominatim = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    q,
    format: "jsonv2",
    countrycodes: "jp",
    addressdetails: "1",
    "accept-language": "ja",
    limit: "8",
  })}`;
  // bbox で日本に絞る（Photon は国指定のパラメータがない）
  const photon = `https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: "8", bbox: "122,20,154,46" })}`;
  const gsi = `https://msearch.gsi.go.jp/address-search/AddressSearch?${new URLSearchParams({ q })}`;
  const ua = { "User-Agent": USER_AGENT, "Accept-Language": "ja" };

  // どれかが落ちても他の結果で候補を出せるよう、並行して呼んで失敗は空扱いにする
  const [overpassJson, photonJson, osmJson, gsiJson] = await Promise.all([
    core ? fetchOverpass(overpassQuery(core), ua) : Promise.resolve(null),
    getJson<{ features?: PhotonFeature[] }>(photon, ua),
    getJson<NominatimItem[]>(nominatim, ua),
    getJson<GsiItem[]>(gsi),
  ]);
  console.info("[places]", q, {
    overpass: overpassJson?.elements?.length ?? "error",
    photon: photonJson?.features?.length ?? "error",
    nominatim: osmJson?.length ?? "error",
    gsi: gsiJson?.length ?? "error",
  });
  const pois = [
    ...parseOverpass(overpassJson?.elements ?? []),
    ...parsePhoton(photonJson?.features ?? []),
    ...parseNominatim(osmJson ?? []),
  ];
  return fillAddresses(mergePlaces(pois, parseGsi((gsiJson ?? []).slice(0, 5))));
}

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
  "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
  "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

/** 国土地理院の逆ジオコーダの結果（市区町村コード＋町字名）を「神奈川県 柳島」のような所在地にする */
export function gsiReverseAddress(json: { results?: { muniCd?: string; lv01Nm?: string } } | null): string {
  const r = json?.results;
  if (!r?.muniCd) return "";
  const pref = PREFECTURES[Number(r.muniCd.slice(0, 2)) - 1] ?? "";
  const town = r.lv01Nm && r.lv01Nm !== "－" ? r.lv01Nm : "";
  return [pref, town].filter(Boolean).join(" ");
}

/** 所在地が分からない候補（キャンプ場タグのみの場所など）に、座標から所在地を補う */
async function fillAddresses(places: Place[]): Promise<Place[]> {
  return Promise.all(
    places.map(async (p) => {
      if (p.address) return p;
      const url = `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?${new URLSearchParams({
        lat: String(p.lat),
        lon: String(p.lon),
      })}`;
      const address = gsiReverseAddress(await getJson(url, {}, 3000));
      return address ? { ...p, address } : p;
    }),
  );
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
