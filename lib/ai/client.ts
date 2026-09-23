import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { AiError, classifyAiError, HOURLY_LIMITS, limitMessage, type AiErrorCode, type AiKind } from "./errors";

export { AiError, type AiErrorCode };

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  // ANTHROPIC_API_KEY を環境変数から読む。キーはサーバー側にのみ存在する。
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

export const model = () => env.anthropicModel();

const MESSAGES: Record<AiErrorCode, string> = {
  invalid_json: "AIの応答を読み取れませんでした。もう一度お試しください。",
  limit_reached: "このアプリの1時間あたりの利用回数に達しました。少し時間をおいてお試しください。",
  rate_limited: "Anthropic（AIの提供元）側の利用上限に達しています。1分ほど待ってからお試しください。",
  no_credit: "Anthropic のクレジット残高が不足しています。console.anthropic.com の Billing でチャージしてください。",
  bad_api_key: "Anthropic の APIキーが無効です。Vercel の ANTHROPIC_API_KEY を確認してください。",
  refused: "この内容ではAIが応答できませんでした。入力を見直してください。",
  overloaded: "AIサービスが混雑しています。少し時間をおいてお試しください。",
  unauthorized: "ログインが必要です。",
  api_error: "AIの呼び出しでエラーが発生しました。",
};

const STATUS: Record<AiErrorCode, number> = {
  invalid_json: 502,
  limit_reached: 429,
  rate_limited: 429,
  no_credit: 402,
  bad_api_key: 500,
  refused: 422,
  overloaded: 503,
  unauthorized: 401,
  api_error: 502,
};

/** SDKの例外やAiErrorを、クライアントに返すJSONレスポンスへ変換する */
export function aiErrorResponse(error: unknown): Response {
  const code = classifyAiError(error);
  const message = (error instanceof AiError && error.userMessage) || MESSAGES[code];
  console.error("[ai]", code, error);
  return Response.json({ error: code, message }, { status: STATUS[code] });
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
export async function enforceRateLimit(supabase: SupabaseClient, userId: string, kind: AiKind): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("ai_requests")
    .select("created_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(HOURLY_LIMITS[kind]);
  if (error) throw error;
  if ((data?.length ?? 0) >= HOURLY_LIMITS[kind]) {
    throw new AiError("limit_reached", `hourly limit: ${kind}`, limitMessage(kind, data?.[0]?.created_at ?? null));
  }
  const { error: insertError } = await supabase.from("ai_requests").insert({ user_id: userId, kind });
  if (insertError) throw insertError;
}
