import type { DiaryEntry } from "@/lib/domain";
import { getUser } from "@/lib/supabase/server";
import { DiaryManager } from "./DiaryManager";

export default async function DiaryPage() {
  const { supabase } = await getUser();
  const [entries, gears] = await Promise.all([
    supabase.from("diary_entries").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("gears").select("name").order("name"),
  ]);
  return (
    <DiaryManager
      entries={(entries.data ?? []) as DiaryEntry[]}
      gearNames={(gears.data ?? []).map((g: { name: string }) => g.name)}
    />
  );
}
