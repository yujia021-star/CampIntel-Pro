"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/server";

export async function deleteCampPlan(id: string): Promise<{ ok: boolean }> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false };
  const { error } = await supabase.from("camp_plans").delete().eq("id", id);
  revalidatePath("/history");
  return { ok: !error };
}
