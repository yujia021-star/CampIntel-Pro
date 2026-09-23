"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { insertWithFallback } from "@/lib/db/compat";
import { BUGS, TEMP_FEELS, WEATHERS } from "@/lib/domain";
import { getUser } from "@/lib/supabase/server";

const nameList = z
  .array(z.string().trim().min(1).max(100))
  .max(30)
  .transform((a) => [...new Set(a)]);

const DiaryInput = z.object({
  campsite: z
    .string()
    .trim()
    .max(100)
    .transform((v) => v || null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を入力してください"),
  weather: z.enum(WEATHERS, "天候を選んでください"),
  temp_feel: z.enum(TEMP_FEELS, "体感温度を選んでください"),
  bugs: z.enum(BUGS, "虫の多さを選んでください"),
  sleep_quality: z.number().int().min(1, "眠りの質を選んでください").max(5),
  good_gear: nameList,
  bad_gear: nameList,
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null),
  nights: z.number().int().min(0).max(2).nullish(),
  plan_id: z.uuid().nullish(),
});
export type DiaryInput = z.input<typeof DiaryInput>;

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function createDiaryEntry(input: DiaryInput): Promise<ActionResult> {
  const parsed = DiaryInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "入力が不正です" };
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "ログインが必要です" };
  // 追加の SQL を実行する前のデータベースでも記録できるよう、泊数と計画のひも付けは外して保存し直す
  const { error } = await insertWithFallback(supabase, "diary_entries", { ...parsed.data, user_id: user.id }, [
    "nights",
    "plan_id",
  ]);
  if (error) return { ok: false, message: "保存に失敗しました" };
  revalidatePath("/diary");
  return { ok: true };
}

export async function deleteDiaryEntry(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "ログインが必要です" };
  const { error } = await supabase.from("diary_entries").delete().eq("id", id);
  if (error) return { ok: false, message: "削除に失敗しました" };
  revalidatePath("/diary");
  return { ok: true };
}
