"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATEGORIES } from "@/lib/domain";
import { getUser } from "@/lib/supabase/server";
import { normalizeTags } from "@/lib/tags";

const GearInput = z.object({
  name: z.string().trim().min(1, "ギア名を入力してください").max(100),
  tags: z.array(z.string()).max(20).transform(normalizeTags),
  category: z.enum(CATEGORIES),
  is_base: z.boolean(),
});
export type GearInput = z.input<typeof GearInput>;

export type ActionResult = { ok: true } | { ok: false; message: string };

async function authed() {
  const { supabase, user } = await getUser();
  if (!user) throw new Error("unauthorized");
  return { supabase, user };
}

export async function createGear(input: GearInput): Promise<ActionResult> {
  const parsed = GearInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "入力が不正です" };
  const { supabase, user } = await authed();
  const { error } = await supabase.from("gears").insert({ ...parsed.data, user_id: user.id });
  if (error) return { ok: false, message: "保存に失敗しました" };
  revalidatePath("/gear");
  return { ok: true };
}

/** 写真から見つけた複数のギアをまとめて登録する */
export async function createGears(inputs: GearInput[]): Promise<ActionResult> {
  if (inputs.length === 0) return { ok: false, message: "登録するギアを選んでください" };
  if (inputs.length > 30) return { ok: false, message: "一度に登録できるのは30件までです" };
  const rows = [];
  for (const input of inputs) {
    const parsed = GearInput.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "入力が不正です" };
    rows.push(parsed.data);
  }
  const { supabase, user } = await authed();
  const { error } = await supabase.from("gears").insert(rows.map((r) => ({ ...r, user_id: user.id })));
  if (error) return { ok: false, message: "保存に失敗しました" };
  revalidatePath("/gear");
  return { ok: true };
}

export async function updateGear(id: string, input: GearInput): Promise<ActionResult> {
  const parsed = GearInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "入力が不正です" };
  const { supabase } = await authed();
  const { error } = await supabase.from("gears").update(parsed.data).eq("id", id);
  if (error) return { ok: false, message: "更新に失敗しました" };
  revalidatePath("/gear");
  return { ok: true };
}

export async function setGearBase(id: string, isBase: boolean): Promise<ActionResult> {
  const { supabase } = await authed();
  const { error } = await supabase.from("gears").update({ is_base: isBase }).eq("id", id);
  if (error) return { ok: false, message: "更新に失敗しました" };
  revalidatePath("/gear");
  return { ok: true };
}

export async function deleteGear(id: string): Promise<ActionResult> {
  const { supabase } = await authed();
  const { error } = await supabase.from("gears").delete().eq("id", id);
  if (error) return { ok: false, message: "削除に失敗しました" };
  revalidatePath("/gear");
  return { ok: true };
}
