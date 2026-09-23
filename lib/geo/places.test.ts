import { describe, expect, it } from "vitest";
import { mergePlaces, parseGsi, parseNominatim } from "./places";

describe("places", () => {
  const osm = parseNominatim([
    {
      place_id: 1,
      lat: "35.4050",
      lon: "138.5700",
      name: "ふもとっぱらキャンプ場",
      display_name: "ふもとっぱらキャンプ場, 麓, 富士宮市, 静岡県, 418-0109, 日本",
      category: "tourism",
      type: "camp_site",
      address: { province: "静岡県", city: "富士宮市", hamlet: "麓" },
    },
    {
      place_id: 2,
      lat: "35.40",
      lon: "138.58",
      name: "麓",
      display_name: "麓, 富士宮市, 静岡県, 日本",
      category: "place",
      type: "hamlet",
    },
  ]);
  const gsi = parseGsi([
    { geometry: { coordinates: [138.5701, 35.4051] }, properties: { title: "静岡県富士宮市麓" } },
    { properties: { title: "座標なし" } },
  ]);

  it("OSM の候補に種類と所在地を付ける", () => {
    expect(osm[0]).toMatchObject({ name: "ふもとっぱらキャンプ場", kind: "キャンプ場", address: "静岡県 富士宮市 麓", lat: 35.405 });
    // address が無いときは display_name から所在地を作る
    expect(osm[1]).toMatchObject({ kind: "地名", address: "静岡県 富士宮市" });
  });

  it("国土地理院の候補は座標のないものを除く", () => {
    expect(gsi).toHaveLength(1);
    expect(gsi[0]).toMatchObject({ name: "静岡県富士宮市麓", lat: 35.4051, lon: 138.5701 });
  });

  it("キャンプ場を先頭にして、同名・近接の重複を除く", () => {
    const merged = mergePlaces([osm[1], osm[0]], [...gsi, { ...osm[0], id: "dup", source: "gsi" }]);
    expect(merged.map((p) => p.name)).toEqual(["ふもとっぱらキャンプ場", "麓", "静岡県富士宮市麓"]);
  });
});

describe("キャンプ場名の検索", () => {
  it("キャンプ場を表す語を除いた名前の核を取り出す", async () => {
    const { campsiteCore } = await import("./places");
    expect(campsiteCore("柳島キャンプ場")).toBe("柳島");
    expect(campsiteCore("ふもとっぱら オートキャンプ場")).toBe("ふもとっぱら");
    expect(campsiteCore("ほったらかしキャンプ場")).toBe("ほったらかし");
    expect(campsiteCore("キャンプ場")).toBeNull();
    expect(campsiteCore("富士宮")).toBe("富士宮");
  });

  it("Overpass の問い合わせはキャンプ場タグで絞り、記号をエスケープする", async () => {
    const { overpassQuery } = await import("./places");
    const q = overpassQuery('a"b(c)');
    expect(q).toContain('["tourism"~"^(camp_site|caravan_site)$"]');
    expect(q).toContain('["name"~"a\\"b\\(c\\)"]');
  });

  it("Overpass と Photon の結果を候補にする", async () => {
    const { parseOverpass, parsePhoton } = await import("./places");
    expect(
      parseOverpass([
        { type: "way", id: 5, center: { lat: 35.31, lon: 139.4 }, tags: { name: "柳島キャンプ場", tourism: "camp_site" } },
        { type: "node", id: 6, lat: 1, lon: 2, tags: {} },
      ]),
    ).toEqual([
      { id: "osm-way-5", name: "柳島キャンプ場", address: "", lat: 35.31, lon: 139.4, kind: "キャンプ場", source: "osm" },
    ]);
    expect(
      parsePhoton([
        {
          geometry: { coordinates: [139.4, 35.31] },
          properties: { osm_id: 5, osm_key: "tourism", osm_value: "camp_site", name: "柳島キャンプ場", state: "神奈川県", city: "茅ヶ崎市" },
        },
      ])[0],
    ).toMatchObject({ kind: "キャンプ場", address: "神奈川県 茅ヶ崎市", lat: 35.31 });
  });

  it("逆ジオコーダの結果から所在地を作る", async () => {
    const { gsiReverseAddress } = await import("./places");
    expect(gsiReverseAddress({ results: { muniCd: "14207", lv01Nm: "柳島" } })).toBe("神奈川県 柳島");
    expect(gsiReverseAddress({ results: { muniCd: "01101", lv01Nm: "－" } })).toBe("北海道");
    expect(gsiReverseAddress(null)).toBe("");
  });
});

describe("AIで調べたキャンプ場", () => {
  it("応答文からJSONを取り出す（前後の文章・壊れたJSONに強い）", async () => {
    const { parseLookupText } = await import("./campsite-lookup");
    expect(
      parseLookupText('調べました。\n{"candidates":[{"name":"柳島キャンプ場","address":"神奈川県茅ヶ崎市柳島海岸","lat":"35.315","lon":139.39}]}'),
    ).toEqual([{ name: "柳島キャンプ場", address: "神奈川県茅ヶ崎市柳島海岸", lat: 35.315, lon: 139.39 }]);
    expect(parseLookupText("見つかりませんでした")).toEqual([]);
    expect(parseLookupText("{broken}")).toEqual([]);
  });

  it("キャンプ場名らしい入力だけAIに調べさせる", async () => {
    const { looksLikeCampsite } = await import("./campsite-lookup");
    expect(looksLikeCampsite("柳島キャンプ場")).toBe(true);
    expect(looksLikeCampsite("朝霧高原")).toBe(false);
  });

  it("AIの座標は住所の地点から5km以内のときだけ使う", async () => {
    const { candidateToPlace } = await import("./campsite-lookup");
    const geo = { id: "g", name: "神奈川県茅ヶ崎市柳島", address: "神奈川県茅ヶ崎市柳島", lat: 35.32, lon: 139.39, kind: "地名", source: "gsi" as const };
    const near = candidateToPlace({ name: "柳島キャンプ場", address: "", lat: 35.315, lon: 139.395 }, geo);
    expect(near).toMatchObject({ lat: 35.315, lon: 139.395, kind: "キャンプ場（AI調べ）", source: "ai", address: "神奈川県茅ヶ崎市柳島" });
    // 思い違いで遠くの座標を答えたら、住所の地点を使う
    expect(candidateToPlace({ name: "x", address: "a", lat: 43, lon: 141 }, geo)).toMatchObject({ lat: 35.32, lon: 139.39 });
    // 住所で引けず、座標も日本の外なら候補にしない
    expect(candidateToPlace({ name: "x", address: "a", lat: 0, lon: 0 }, null)).toBeNull();
    expect(candidateToPlace({ name: "x", address: "a", lat: 35.3, lon: 139.3 }, null)).toMatchObject({ lat: 35.3 });
  });
});
