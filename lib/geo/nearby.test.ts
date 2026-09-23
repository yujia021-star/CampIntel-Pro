import { describe, expect, it } from "vitest";
import { nearbyQuery, parseNearby } from "./nearby";

describe("周辺施設の候補", () => {
  it("種類ごとのタグと半径で問い合わせる", () => {
    const q = nearbyQuery("onsen", 35.3, 139.4);
    expect(q).toContain('nwr["amenity"="public_bath"]["name"](around:20000,35.30000,139.40000);');
    expect(q).toContain('["leisure"="spa"]');
  });

  it("近い順・同名は1件・最大5件", () => {
    const el = (name: string, dLat: number) => ({ lat: 35 + dLat, lon: 139, tags: { name } });
    const out = parseNearby(
      [el("遠い湯", 0.1), el("近い湯", 0.01), el("近い湯", 0.02), el("A", 0.03), el("B", 0.04), el("C", 0.05), el("D", 0.06), { lat: 35, lon: 139, tags: {} }],
      { lat: 35, lon: 139 },
    );
    expect(out.map((p) => p.name)).toEqual(["近い湯", "A", "B", "C", "D"]);
    expect(out[0].distance_km).toBe(1.1);
  });
});
