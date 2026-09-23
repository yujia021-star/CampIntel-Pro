import { describe, expect, it } from "vitest";
import { dayLabel } from "./WeatherCard";

describe("dayLabel", () => {
  it("日付の文字列どおりの月日と曜日を出す", () => {
    expect(dayLabel("2026-09-26")).toBe("9/26(土)");
    expect(dayLabel("2026-10-01")).toBe("10/1(木)");
  });
});
