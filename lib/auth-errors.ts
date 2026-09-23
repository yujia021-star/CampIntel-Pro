/** Supabase Auth のエラーを、ログイン画面に出す日本語メッセージにする */
export function loginErrorMessage(error: { code?: string; status?: number; message: string }): string {
  const code = error.code ?? "";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || error.status === 429) {
    return "メールの送信回数が上限に達しました。しばらく（最大1時間ほど）待ってから、1回だけ送ってください。";
  }
  // Supabase 標準のメール送信は、プロジェクトのメンバーのアドレスにしか送れない
  if (code === "email_address_not_authorized") {
    return "このアドレスには Supabase 標準のメール送信で送れません。Supabase で SMTP（メール送信）の設定が必要です。";
  }
  if (code === "email_address_invalid") {
    return "メールアドレスの形式が正しくありません。";
  }
  // allowed_emails にないアドレスは auth.users へのトリガーで拒否される
  if (code === "unexpected_failure" || /database error saving new user/i.test(error.message)) {
    return "このメールアドレスは招待されていません。許可リスト（allowed_emails）への登録を確認してください。";
  }
  if (code === "otp_disabled" || code === "signup_disabled") {
    return "Supabase でメールログインが無効になっています。Authentication の設定を確認してください。";
  }
  return `ログインリンクを送れませんでした（${code || error.status || error.message}）。`;
}
