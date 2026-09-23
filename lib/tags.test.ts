import { describe, expect, it } from "vitest";
import { normalizeTags, parseTagInput } from "./tags";

describe("tags", () => {
  it("#を外して小文字化し重複を除く", () => {
    expect(normalizeTags(["#Winter", "winter", "##防寒", " ", "#"])).toEqual(["winter", "防寒"]);
  });
  it("区切り文字で分割する", () => {
    expect(parseTagInput("#防寒, #冬用 　#軽量、#防寒")).toEqual(["防寒", "冬用", "軽量"]);
  });
});
