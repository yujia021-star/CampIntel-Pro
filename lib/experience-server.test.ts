import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("自己申告の読み込み", () => {
  it("泊数は数で受け取り、以前の幅の申告も読める", async () => {
    const { SelfReportSchema } = await import("./experience-server");
    const base = { conditions: ["rain"], windows: [0], reported_at: "2026-09-23" };
    expect(SelfReportSchema.parse({ ...base, prior_nights: 8 }).prior_nights).toBe(8);
    expect(SelfReportSchema.parse({ ...base, prior_nights: "5-9" }).prior_nights).toBe(5);
    expect(SelfReportSchema.safeParse({ ...base, prior_nights: -1 }).success).toBe(false);
    expect(SelfReportSchema.safeParse({ ...base, prior_nights: 1.5 }).success).toBe(false);
  });
});
