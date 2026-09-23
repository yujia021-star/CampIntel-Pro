"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { loginErrorMessage } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
}

/**
 * マジックリンクの戻り先のベースURL。
 * 実際にアクセスされているドメインを使う（環境変数の設定漏れ・食い違いで localhost に戻るのを防ぐ）。
 * 取れないときだけ NEXT_PUBLIC_SITE_URL を使う。
 */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return env.siteUrl();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { status: "error", message: "メールアドレスの形式が正しくありません" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm` },
  });

  if (error) {
    console.error("[login]", error.code, error.status, error.message);
    return { status: "error", message: loginErrorMessage(error) };
  }
  return { status: "sent", message: `${parsed.data} にログインリンクを送りました。メールを確認してください。` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
