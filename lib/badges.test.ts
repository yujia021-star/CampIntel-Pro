import { describe, expect, it } from "vitest";
import { computeBadges, newlyEarnedBadge } from "./badges";

type Entry = Parameters<typeof computeBadges>[0][number];

const entry = (over: Partial<Entry> = {}): Entry => ({
  weather: "晴れ",
  temp_feel: "ちょうどいい",
  bugs: "なし",
  sleep_quality: 3,
  good_gear: [],
  ...over,
});

const earned = (entries: Entry[]) =>
  computeBadges(entries)
    .filter((b) => b.earned)
    .map((b) => b.id);

const times = (n: number, over: Partial<Entry> = {}) => Array.from({ length: n }, () => entry(over));

describe("computeBadges", () => {
  it("8種類のバッジを返す", () => {
    expect(computeBadges([])).toHaveLength(8);
    expect(earned([])).toEqual([]);
  });

  it("記録回数のバッジ", () => {
    expect(earned(times(1))).toEqual(["first"]);
    expect(earned(times(3))).toEqual(["first", "three"]);
    expect(earned(times(10))).toEqual(["first", "three", "ten"]);
  });

  it("雨・寒さ・虫は3回で獲得（2回では未獲得）", () => {
    expect(earned(times(2, { weather: "雨" }))).not.toContain("rain");
    expect(earned(times(3, { weather: "雨" }))).toContain("rain");
    expect(earned(times(3, { temp_feel: "寒すぎ" }))).toContain("cold");
    expect(earned(times(3, { bugs: "多い" }))).toContain("bugs");
  });

  it("快眠は★4以上を5回", () => {
    expect(earned(times(4, { sleep_quality: 5 }))).not.toContain("sleep");
    expect(earned([...times(3, { sleep_quality: 4 }), ...times(2, { sleep_quality: 5 })])).toContain("sleep");
  });

  it("ギアマイスターは良かったギアの合計10件", () => {
    expect(earned(times(3, { good_gear: ["a", "b", "c"] }))).not.toContain("gearmeister");
    expect(earned([...times(3, { good_gear: ["a", "b", "c"] }), entry({ good_gear: ["d"] })])).toContain("gearmeister");
  });
});

describe("newlyEarnedBadge", () => {
  it("今回の記録で新しく獲得したバッジを返す", () => {
    expect(newlyEarnedBadge([], [entry()])?.id).toBe("first");
    expect(newlyEarnedBadge(times(1), times(2))).toBeUndefined();
    expect(newlyEarnedBadge(times(2), times(3))?.id).toBe("three");
  });
});
