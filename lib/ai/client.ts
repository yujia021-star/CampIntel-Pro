import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  // ANTHROPIC_API_KEY を環境変数から読む。キーはサーバー側にのみ存在する。
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

export const model = () => env.anthropicModel();

export type AiErrorCode = "invalid_json" | "rate_limited" | "refused" | "overloaded" | "unauthorized" | "api_error";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<AiErrorCode, string> = {
  invalid_json: "AIの応答を読み取れませんでした。もう一度お試しください。",
  rate_limited: "AIの利用が混み合っています。少し時間をおいてお試しください。",
  refused: "この内容ではAIが応答できませんでした。入力を見直してください。",
  overloaded: "AIサービスが混雑しています。少し時間をおいてお試しください。",
  unauthorized: "ログインが必要です。",
  api_error: "AIの呼び出しでエラーが発生しました。",
};

const STATUS: Record<AiErrorCode, number> = {
  invalid_json: 502,
  rate_limited: 429,
  refused: 422,
  overloaded: 503,
  unauthorized: 401,
  api_error: 502,
};

/** SDKの例外やAiErrorを、クライアントに返すJSONレスポンスへ変換する */
export function aiErrorResponse(error: unknown): Response {
  let code: AiErrorCode = "api_error";
  if (error instanceof AiError) code = error.code;
  else if (error instanceof Anthropic.RateLimitError) code = "rate_limited";
  else if (error instanceof Anthropic.InternalServerError && error.status === 529) code = "overloaded";
  else if (error instanceof Anthropic.APIError) code = "api_error";

  console.error("[ai]", code, error);
  return Response.json({ error: code, message: MESSAGES[code] }, { status: STATUS[code] });
}

/** 構造化出力の応答を検証する。途中終了・拒否・パース失敗は例外にする。 */
export function requireParsed<T>(response: { stop_reason: string | null; parsed_output?: T | null }): T {
  if (response.stop_reason === "refusal") throw new AiError("refused", "refusal");
  if (response.stop_reason === "max_tokens") throw new AiError("invalid_json", "max_tokens");
  if (response.parsed_output == null) throw new AiError("invalid_json", "parsed_output is null");
  return response.parsed_output;
}

/**
 * 1ユーザーあたり1時間の呼び出し回数を制限する（サーバーレスでも効くようDBで数える）。
 * 上限内なら今回の呼び出しを記録する。
 */
export async function enforceRateLimit(supabase: SupabaseClient, userId: string, kind: string): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("ai_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= env.aiHourlyLimit()) throw new AiError("rate_limited", "hourly limit");
  const { error: insertError } = await supabase.from("ai_requests").insert({ user_id: userId, kind });
  if (insertError) throw insertError;
}
