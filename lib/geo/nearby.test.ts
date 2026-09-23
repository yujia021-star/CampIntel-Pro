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

describe("周辺施設の取得", () => {
  it("どれかの Overpass が返せばそれを使い、全部だめなら Nominatim で名前から探す", async () => {
    const { fetchNearby } = await import("./nearby");
    const { vi } = await import("vitest");
    const origin = { lat: 35, lon: 139 };
    const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

    const ok = vi.fn((url: string) =>
      url.includes("private.coffee") ? json({ elements: [{ lat: 35.01, lon: 139, tags: { name: "湯" } }] }) : json({}, 429),
    );
    vi.stubGlobal("fetch", ok);
    expect(await fetchNearby("onsen", origin)).toMatchObject({ ok: true, source: "overpass.private.coffee", places: [{ name: "湯" }] });

    vi.stubGlobal("fetch", (url: string) =>
      url.includes("nominatim") ? json([{ lat: "35.02", lon: "139", name: "〇〇温泉", category: "amenity", type: "public_bath" }, { lat: "35.01", lon: "139", name: "〇〇温泉病院", category: "amenity", type: "hospital" }]) : json({}, 504),
    );
    expect(await fetchNearby("onsen", origin)).toMatchObject({ ok: true, source: "nominatim.openstreetmap.org", places: [{ name: "〇〇温泉" }] });

    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Load failed")));
    const ng = await fetchNearby("convenience", origin);
    expect(ng).toEqual({ ok: false, errors: expect.arrayContaining(["overpass-api.de: 接続できない"]) });
    vi.unstubAllGlobals();
  });
});

describe("名前で探したときの絞り込み", () => {
  it("温泉は温泉施設だけ。病院や駐車場は外す", async () => {
    const { filterNominatim, displayName } = await import("./nearby");
    const items = [
      { lat: "1", lon: "1", name: "下部温泉会館", category: "amenity", type: "public_bath" },
      { lat: "1", lon: "1", name: "下部温泉病院", category: "amenity", type: "hospital" },
      { lat: "1", lon: "1", name: "下部温泉郷一時駐車場", category: "amenity", type: "parking" },
      { lat: "1", lon: "1", name: "〇〇温泉スパ", category: "leisure", type: "spa" },
    ];
    expect(filterNominatim(items, ["amenity:public_bath", "leisure:spa"]).map((x) => x.name)).toEqual(["下部温泉会館", "〇〇温泉スパ"]);
    expect(filterNominatim([{ lat: "1", lon: "1", category: "healthcare", type: "clinic" }], ["healthcare:*"])).toHaveLength(1);
    expect(displayName("あさぎり温泉;風の湯")).toBe("あさぎり温泉 / 風の湯");
  });
});
