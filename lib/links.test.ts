import { describe, expect, it } from "vitest";
import { hasAffiliate, nearbyCategoriesFor, nearbyRouteUrl, reserveLinks, routeLinks, shopLinks } from "./links";

describe("外部リンク", () => {
  it("地図アプリの行き方リンク", () => {
    const r = routeLinks({ lat: 35.3151234, lon: 139.39, name: "柳島キャンプ場" });
    expect(r.google).toBe("https://www.google.com/maps/dir/?api=1&destination=35.31512,139.39000");
    expect(r.apple).toContain("daddr=35.31512,139.39000");
    // 出発地は診断した場所、行き先は「種類＋住所」で近くの施設を探させる
    const url = new URL(nearbyRouteUrl("日帰り温泉", { name: "柳島キャンプ場", address: "神奈川県 茅ヶ崎市", lat: 35.31, lon: 139.4 }));
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("origin")).toBe("35.31000,139.40000");
    expect(url.searchParams.get("destination")).toBe("日帰り温泉 神奈川県 茅ヶ崎市");
    expect(new URL(nearbyRouteUrl("コンビニ", { name: "ふもとっぱら", address: "", lat: 35, lon: 138 })).searchParams.get("destination")).toBe(
      "コンビニ ふもとっぱら",
    );
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
