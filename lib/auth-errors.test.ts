import { describe, expect, it } from "vitest";
import { loginErrorMessage } from "./auth-errors";

describe("loginErrorMessage", () => {
  it("メールかパスワードの間違い", () => {
    expect(loginErrorMessage({ code: "invalid_credentials", status: 400, message: "" })).toContain("パスワードが違います");
  });
  it("確認待ちのアカウント", () => {
    expect(loginErrorMessage({ code: "email_not_confirmed", status: 400, message: "" })).toContain("Auto Confirm");
  });
  it("試行回数の上限", () => {
    expect(loginErrorMessage({ status: 429, message: "" })).toContain("多すぎます");
  });
  it("不明なエラーはコードを表示する", () => {
    expect(loginErrorMessage({ code: "something_new", status: 400, message: "x" })).toContain("something_new");
  });
});
