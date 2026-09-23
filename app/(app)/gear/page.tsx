import type { Gear } from "@/lib/domain";
import { getUser } from "@/lib/supabase/server";
import { GearManager } from "./GearManager";

export default async function GearPage() {
  const { supabase } = await getUser();
  const { data } = await supabase.from("gears").select("*").order("created_at", { ascending: false });
  return <GearManager gears={(data ?? []) as Gear[]} />;
}
