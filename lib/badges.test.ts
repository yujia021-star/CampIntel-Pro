import { describe, expect, it } from "vitest";
import { computeBadges } from "./badges";

const entry = (over: Partial<Parameters<typeof computeBadges>[0][number]> = {}) => ({
  campsite: null,
  weather: "晴れ" as const,
  temp_feel: "ちょうどいい" as const,
  bugs: "なし" as const,
  sleep_quality: 3,
  good_gear: [],
  bad_gear: [],
  note: null,
  ...over,
});

const earned = (entries: Parameters<typeof computeBadges>[0]) =>
  computeBadges(entries)
    .filter((b) => b.earned)
    .map((b) => b.id);

describe("computeBadges", () => {
  it("8種類のバッジを返す", () => {
    expect(computeBadges([])).toHaveLength(8);
    expect(earned([])).toEqual([]);
  });

  it("条件ごとに獲得する", () => {
    expect(earned([entry()])).toEqual(["first"]);
    expect(
      earned([
        entry({ weather: "雨", campsite: "A" }),
        entry({ temp_feel: "寒すぎ", campsite: "b" }),
        entry({ bugs: "多い", sleep_quality: 5, campsite: "a " }),
      ]),
    ).toEqual(["first", "three", "rain", "cold", "bugs", "sleep"]);
    expect(earned([entry({ campsite: "A" }), entry({ campsite: "B" }), entry({ campsite: "C" })])).toContain("explorer");
    expect(earned(Array.from({ length: 10 }, () => entry()))).toContain("ten");
  });
});
