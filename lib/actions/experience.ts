"use server";

import { revalidatePath } from "next/cache";
import { REPORT_KEY, SelfReportSchema } from "@/lib/experience-server";
import { getUser } from "@/lib/supabase/server";
import { todayJst } from "@/lib/weather/forecast";

/** アプリを使う前の経験の自己申告を保存する */
export async function saveExperienceReport(input: unknown): Promise<{ ok: boolean; message?: string }> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "ログインが必要です。" };
  const parsed = SelfReportSchema.safeParse({ ...(input as object), reported_at: todayJst() });
  if (!parsed.success) return { ok: false, message: "入力を確認してください。" };
  const { error } = await supabase.auth.updateUser({ data: { [REPORT_KEY]: parsed.data } });
  if (error) return { ok: false, message: "保存できませんでした。" };
  revalidatePath("/diary");
  revalidatePath("/");
  return { ok: true };
}
