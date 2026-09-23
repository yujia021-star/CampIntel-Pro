import { describe, expect, it } from "vitest";
import { loginErrorMessage } from "./auth-errors";

describe("loginErrorMessage", () => {
  it("送信回数の上限", () => {
    expect(loginErrorMessage({ code: "over_email_send_rate_limit", status: 429, message: "" })).toContain("上限");
    expect(loginErrorMessage({ status: 429, message: "" })).toContain("上限");
  });
  it("許可リスト外（DBトリガーで拒否）", () => {
    expect(loginErrorMessage({ status: 500, message: "Database error saving new user" })).toContain("招待されていません");
  });
  it("標準SMTPで送れないアドレス", () => {
    expect(loginErrorMessage({ code: "email_address_not_authorized", status: 400, message: "" })).toContain("SMTP");
  });
  it("不明なエラーはコードを表示する", () => {
    expect(loginErrorMessage({ code: "something_new", status: 400, message: "x" })).toContain("something_new");
  });
});
