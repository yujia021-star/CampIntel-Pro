import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AiError, classifyAiError, limitMessage } from "./errors";

const apiError = (status: number, message: string) =>
  Anthropic.APIError.generate(status, { type: "error", error: { type: "x", message } }, message, new Headers());

describe("classifyAiError", () => {
  it("アプリの上限と Anthropic の上限を区別する", () => {
    expect(classifyAiError(new AiError("limit_reached", "x"))).toBe("limit_reached");
    expect(classifyAiError(apiError(429, "rate limit"))).toBe("rate_limited");
  });
  it("クレジット不足・APIキー無効・過負荷", () => {
    expect(classifyAiError(apiError(400, "Your credit balance is too low to access the Anthropic API."))).toBe("no_credit");
    expect(classifyAiError(apiError(401, "invalid x-api-key"))).toBe("bad_api_key");
    expect(classifyAiError(apiError(529, "Overloaded"))).toBe("overloaded");
    expect(classifyAiError(apiError(400, "other"))).toBe("api_error");
    expect(classifyAiError(new Error("x"))).toBe("api_error");
  });
});

describe("limitMessage", () => {
  it("機能名・上限回数・あと何分で使えるかを出す", () => {
    const now = Date.parse("2026-09-23T10:00:00Z");
    expect(limitMessage("diagnose", "2026-09-23T09:15:30Z", now)).toBe(
      "プラン診断は1時間に20回までです。あと16分ほどで使えるようになります。",
    );
    expect(limitMessage("gear_suggest", null, now)).toContain("60分");
  });
});
