"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { loginErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "error";
  message?: string;
}

const Credentials = z.object({
  email: z.email("メールアドレスの形式が正しくありません"),
  password: z.string().min(1, "パスワードを入力してください"),
});

// アカウントは Supabase の管理画面（Authentication → Users → Add user）で作る。
// ログインのたびにメールを送らないので、送信回数の上限やリダイレクト設定に左右されない。
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = Credentials.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    console.error("[login]", error.code, error.status, error.message);
    return { status: "error", message: loginErrorMessage(error) };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
