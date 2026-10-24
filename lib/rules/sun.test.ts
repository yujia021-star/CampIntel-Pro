import { describe, expect, it } from "vitest";
import { minusMinutes, staySun, sunTimes } from "./sun";

describe("日の出・日の入り", () => {
  it("国立天文台の値と数分以内で合う", () => {
    // 東京 2026-10-24：日の出5:54・日の入り16:56／札幌 冬至：7:03・16:03
    expect(sunTimes(35.6895, 139.6917, "2026-10-24")).toEqual({ sunrise: "5:55", sunset: "16:56" });
    expect(sunTimes(43.06, 141.35, "2026-12-22")).toEqual({ sunrise: "7:03", sunset: "16:03" });
  });

  it("泊まりは初日の日の入りと翌朝の日の出", () => {
    const s = staySun(35.6895, 139.6917, "2026-10-24", 1);
    expect(s.sunset).toBe("16:56");
    expect(s.sunrise).toBe(sunTimes(35.6895, 139.6917, "2026-10-25")!.sunrise);
  });

  it("時刻から分を引く", () => {
    expect(minusMinutes("16:56", 60)).toBe("15:56");
    expect(minusMinutes("0:30", 60)).toBe("23:30");
  });
});
