// 地図アプリ・周辺施設・予約・買い物への外部リンク（APIキー不要、URLを組み立てるだけ）

export interface LatLon {
  lat: number;
  lon: number;
}

const coord = (p: LatLon) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

/** 地図アプリで経路を開くリンク */
export function routeLinks(p: LatLon & { name?: string }) {
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${coord(p)}`,
    apple: `https://maps.apple.com/?daddr=${coord(p)}${p.name ? `&q=${encodeURIComponent(p.name)}` : ""}`,
  };
}

/** その地点の周辺を Google マップで検索するリンク（例: 「温泉」） */
export function mapsSearchUrl(keyword: string, p: LatLon, zoom = 12): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(keyword)}/@${coord(p)},${zoom}z`;
}

export type NearbyKind =
  | "onsen"
  | "supermarket"
  | "convenience"
  | "hardware"
  | "hospital"
  | "fuel"
  | "roadside"
  | "park"
  | "cafe"
  | "sightseeing";

export interface NearbyCategory {
  kind: NearbyKind;
  icon: string;
  label: string;
  /** Google マップで探すときの言葉 */
  keyword: string;
  /** 地図データ（OpenStreetMap）から名前と距離を出せるか */
  osm: boolean;
}

const CATEGORY: Record<NearbyKind, NearbyCategory> = {
  onsen: { kind: "onsen", icon: "♨️", label: "温泉・銭湯", keyword: "日帰り温泉", osm: true },
  supermarket: { kind: "supermarket", icon: "🛒", label: "スーパー", keyword: "スーパー", osm: true },
  convenience: { kind: "convenience", icon: "🏪", label: "コンビニ", keyword: "コンビニ", osm: true },
  hardware: { kind: "hardware", icon: "🪵", label: "ホームセンター（薪・燃料）", keyword: "ホームセンター", osm: true },
  hospital: { kind: "hospital", icon: "🏥", label: "病院", keyword: "病院", osm: true },
  fuel: { kind: "fuel", icon: "⛽", label: "ガソリンスタンド", keyword: "ガソリンスタンド", osm: true },
  roadside: { kind: "roadside", icon: "🛣️", label: "道の駅", keyword: "道の駅", osm: false },
  park: { kind: "park", icon: "🛝", label: "公園・遊び場", keyword: "公園 遊具", osm: false },
  cafe: { kind: "cafe", icon: "☕", label: "カフェ", keyword: "カフェ", osm: false },
  sightseeing: { kind: "sightseeing", icon: "📸", label: "観光・絶景", keyword: "観光スポット", osm: false },
};

/**
 * 同行者に合わせて周辺施設の種類を並べる。
 * 温泉・買い出し・病院はどの同行者でも出し、同行者ごとに向いた場所を前に足す。
 */
export function nearbyCategoriesFor(companions: string | null | undefined): NearbyCategory[] {
  const c = companions ?? "";
  const extra: NearbyKind[] = /家族|子/.test(c)
    ? ["park", "roadside"]
    : /パートナー|夫婦|恋人/.test(c)
      ? ["cafe", "sightseeing", "roadside"]
      : /友人|友達|仲間/.test(c)
        ? ["roadside", "sightseeing"]
        : /ソロ|一人|ひとり/.test(c)
          ? ["roadside"]
          : ["roadside"];
  const base: NearbyKind[] = ["onsen", "supermarket", "convenience", "hardware", ...extra, "fuel", "hospital"];
  return [...new Set(base)].map((k) => CATEGORY[k]);
}

export function nearbyCategory(kind: NearbyKind): NearbyCategory {
  return CATEGORY[kind];
}

/** キャンプ場の予約・空き状況を探すリンク（予約サイトの公開APIがないため、検索結果を開く） */
export function reserveLinks(campsite: string) {
  const q = campsite.trim();
  return [
    {
      label: "なっぷで空き状況を探す",
      icon: "🏕️",
      url: `https://www.google.com/search?q=${encodeURIComponent(`${q} site:nap-camp.com`)}`,
    },
    {
      label: "公式サイトで予約する",
      icon: "🔗",
      url: `https://www.google.com/search?q=${encodeURIComponent(`${q} 予約 公式`)}`,
    },
  ];
}

export interface ShopLink {
  label: string;
  url: string;
}

/**
 * 「要準備」のギアを探す通販リンク。
 * アフィリエイトIDが環境変数に設定されていれば、紹介リンクにする（ビルド時に埋め込まれる）。
 */
export function shopLinks(
  item: string,
  ids: { amazonTag?: string; rakutenId?: string } = {
    amazonTag: process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG,
    rakutenId: process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID,
  },
): ShopLink[] {
  const q = encodeURIComponent(item);
  const amazon = `https://www.amazon.co.jp/s?k=${q}${ids.amazonTag ? `&tag=${encodeURIComponent(ids.amazonTag)}` : ""}`;
  const rakutenSearch = `https://search.rakuten.co.jp/search/mall/${q}/`;
  const rakuten = ids.rakutenId
    ? `https://hb.afl.rakuten.co.jp/hgc/${ids.rakutenId}/?pc=${encodeURIComponent(rakutenSearch)}&m=${encodeURIComponent(rakutenSearch)}`
    : rakutenSearch;
  return [
    { label: "Amazon", url: amazon },
    { label: "楽天", url: rakuten },
  ];
}

/** アフィリエイトIDが1つでも設定されているか（「PR」表記を出すため） */
export function hasAffiliate(
  ids = { amazonTag: process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG, rakutenId: process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID },
): boolean {
  return Boolean(ids.amazonTag || ids.rakutenId);
}
