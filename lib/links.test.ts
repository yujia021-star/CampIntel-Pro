import { describe, expect, it } from "vitest";
import { hasAffiliate, mapsSearchUrl, nearbyCategoriesFor, reserveLinks, routeLinks, shopLinks } from "./links";

describe("外部リンク", () => {
  it("地図アプリの行き方リンク", () => {
    const r = routeLinks({ lat: 35.3151234, lon: 139.39, name: "柳島キャンプ場" });
    expect(r.google).toBe("https://www.google.com/maps/dir/?api=1&destination=35.31512,139.39000");
    expect(r.apple).toContain("daddr=35.31512,139.39000");
    // 住所を検索語に入れて、今いる場所ではなく診断した場所の周りを探す
    expect(mapsSearchUrl("日帰り温泉", { name: "柳島キャンプ場", address: "神奈川県 茅ヶ崎市" })).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("日帰り温泉 神奈川県 茅ヶ崎市")}`,
    );
    expect(mapsSearchUrl("コンビニ", { name: "ふもとっぱら", address: "" })).toContain(encodeURIComponent("コンビニ ふもとっぱら"));
  });

  it("同行者で周辺施設の並びを変える（温泉・買い出し・病院は常に出す）", () => {
    const kinds = (c: string | null) => nearbyCategoriesFor(c).map((x) => x.kind);
    expect(kinds("家族")).toContain("park");
    expect(kinds("パートナー")).toContain("cafe");
    expect(kinds("ソロ")).not.toContain("park");
    for (const c of ["家族", "ソロ", null]) {
      expect(kinds(c)).toEqual(expect.arrayContaining(["onsen", "supermarket", "hospital"]));
    }
  });

  it("アフィリエイトIDがあれば紹介リンクにする", () => {
    expect(shopLinks("寝袋", {})).toEqual([
      { label: "Amazon", url: `https://www.amazon.co.jp/s?k=${encodeURIComponent("寝袋")}` },
      { label: "楽天", url: `https://search.rakuten.co.jp/search/mall/${encodeURIComponent("寝袋")}/` },
    ]);
    const [amazon, rakuten] = shopLinks("寝袋", { amazonTag: "camp-22", rakutenId: "abc.def" });
    expect(amazon.url).toContain("&tag=camp-22");
    expect(rakuten.url.startsWith("https://hb.afl.rakuten.co.jp/hgc/abc.def/?pc=")).toBe(true);
    expect(hasAffiliate({ amazonTag: undefined, rakutenId: undefined })).toBe(false);
    expect(hasAffiliate({ amazonTag: "x", rakutenId: undefined })).toBe(true);
  });

  it("予約リンクはキャンプ場名で検索する", () => {
    expect(reserveLinks(" ふもとっぱら ")[0].url).toContain(encodeURIComponent("ふもとっぱら site:nap-camp.com"));
  });
});
