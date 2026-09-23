import Anthropic from "@anthropic-ai/sdk";

// AI呼び出しのエラー分類と、利用回数の上限（サーバー専用の client.ts から切り出したテスト可能な部分）

export type AiErrorCode =
  | "invalid_json"
  | "limit_reached"
  | "rate_limited"
  | "no_credit"
  | "bad_api_key"
  | "refused"
  | "overloaded"
  | "unauthorized"
  | "api_error";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
    /** 画面に出す文言（省略時はコードごとの既定文言） */
    public userMessage?: string,
  ) {
    super(message);
  }
}

export function classifyAiError(error: unknown): AiErrorCode {
  if (error instanceof AiError) return error.code;
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "bad_api_key";
  }
  // クレジット不足は 400（invalid_request_error）で返ってくる
  if (error instanceof Anthropic.BadRequestError && /credit balance/i.test(error.message)) return "no_credit";
  if (error instanceof Anthropic.APIError && error.status === 529) return "overloaded";
  return "api_error";
}

/**
 * 1ユーザーあたり1時間の呼び出し回数の上限（機能ごと）。
 * タグ提案は入力が止まるたびに呼ばれるので多めにし、重い診断は少なめにする。
 */
export const HOURLY_LIMITS = { diagnose: 20, gear_suggest: 150, gear_recognize: 40, place_lookup: 30 } as const;
export type AiKind = keyof typeof HOURLY_LIMITS;

const KIND_LABELS: Record<AiKind, string> = {
  diagnose: "プラン診断",
  gear_suggest: "タグの自動提案",
  gear_recognize: "写真からの入力",
  place_lookup: "AIによるキャンプ場探し",
};

/** 上限に達したときの文言。いちばん古い記録が1時間を過ぎるまでの分数を添える */
export function limitMessage(kind: AiKind, oldestAt: string | null, now = Date.now()): string {
  const waitMin = oldestAt ? Math.max(1, Math.ceil((new Date(oldestAt).getTime() + 3600_000 - now) / 60_000)) : 60;
  return `${KIND_LABELS[kind]}は1時間に${HOURLY_LIMITS[kind]}回までです。あと${waitMin}分ほどで使えるようになります。`;
}
