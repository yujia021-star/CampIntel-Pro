import { describe, expect, it } from "vitest";
import { isMissingColumnError } from "./compat";

describe("isMissingColumnError", () => {
  it("未作成の列によるエラーを見分ける", () => {
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'nights' column of 'camp_plans' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ code: "42703", message: 'column "nights" does not exist' })).toBe(true);
    expect(isMissingColumnError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});
