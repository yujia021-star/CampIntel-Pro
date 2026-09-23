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
