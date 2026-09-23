import { describe, expect, it } from "vitest";
import { nearbyQuery, parseNearby } from "./nearby";

describe("周辺施設", () => {
  it("Overpass の問い合わせに種類ごとの半径を入れる", () => {
    const q = nearbyQuery(35.3, 139.4);
    expect(q).toContain('nwr["amenity"="public_bath"]["name"](around:15000,35.30000,139.40000);');
    expect(q).toContain('["shop"~"^(doityourself|hardware)$"]');
  });

  it("種類ごとに近い順で3件まで、同名は1件にする", () => {
    const origin = { lat: 35, lon: 139 };
    const el = (id: number, tags: Record<string, string>, dLat: number) => ({ type: "node", id, lat: 35 + dLat, lon: 139, tags });
    const out = parseNearby(
      [
        el(1, { amenity: "public_bath", name: "遠い湯" }, 0.1),
        el(2, { amenity: "public_bath", name: "近い湯" }, 0.01),
        el(3, { shop: "convenience", name: "コンビニ" }, 0.02),
        el(4, { shop: "convenience", name: "コンビニ" }, 0.03),
        el(5, { shop: "convenience", name: "B" }, 0.04),
        el(6, { shop: "convenience", name: "C" }, 0.05),
        el(7, { shop: "convenience", name: "D" }, 0.06),
        el(8, { shop: "bakery", name: "パン屋" }, 0.01),
        { type: "way", id: 9, center: { lat: 35.02, lon: 139 }, tags: { amenity: "hospital", "name:ja": "病院", name: "Hospital" } },
      ],
      origin,
    );
    expect(out.filter((p) => p.kind === "onsen").map((p) => p.name)).toEqual(["近い湯", "遠い湯"]);
    expect(out.filter((p) => p.kind === "convenience").map((p) => p.name)).toEqual(["コンビニ", "B", "C"]);
    expect(out.find((p) => p.kind === "hospital")).toMatchObject({ name: "病院", distance_km: 2.2 });
    expect(out.some((p) => p.name === "パン屋")).toBe(false);
  });
});
