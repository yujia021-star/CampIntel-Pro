"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { loginErrorMessage } from "@/lib/auth-errors";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { status: "error", message: "メールアドレスの形式が正しくありません" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${env.siteUrl()}/auth/confirm` },
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
