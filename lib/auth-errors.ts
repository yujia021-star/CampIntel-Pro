/** Supabase Auth のログインエラーを、ログイン画面に出す日本語メッセージにする */
export function loginErrorMessage(error: { code?: string; status?: number; message: string }): string {
  const code = error.code ?? "";
  if (code === "invalid_credentials") {
    return "メールアドレスかパスワードが違います。";
  }
  // 管理画面で作るときに「Auto Confirm User」を付け忘れると、確認待ちのままになる
  if (code === "email_not_confirmed") {
    return "このアカウントはまだ確認されていません。Supabase の Users で「Auto Confirm User」を付けて作り直してください。";
  }
  if (code === "user_banned") {
    return "このアカウントは利用停止になっています。";
  }
  if (code === "over_request_rate_limit" || error.status === 429) {
    return "ログインの試行回数が多すぎます。数分待ってからもう一度お試しください。";
  }
  return `ログインできませんでした（${code || error.status || error.message}）。`;
}
