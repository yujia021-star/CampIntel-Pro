import { getUser } from "@/lib/supabase/server";
import { DiagnoseForm } from "./DiagnoseForm";

export default async function DiagnosePage() {
  const { supabase } = await getUser();
  const [gears, diaries] = await Promise.all([
    supabase.from("gears").select("id", { count: "exact", head: true }),
    supabase.from("diary_entries").select("id", { count: "exact", head: true }),
  ]);
  return <DiagnoseForm gearCount={gears.count ?? 0} diaryCount={diaries.count ?? 0} />;
}
