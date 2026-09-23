import { z } from "zod";
import type { Place } from "@/lib/geo/places";
import { getUser } from "@/lib/supabase/server";
import { DiagnoseForm } from "./DiagnoseForm";

// 天気の画面から「この日で診断」したときに、場所と日付を引き継ぐ
const Prefill = z.object({
  name: z.string().trim().min(1).max(100),
  address: z.string().max(200).default(""),
  lat: z.coerce.number().min(20).max(46),
  lon: z.coerce.number().min(122).max(154),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export default async function DiagnosePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const prefill = Prefill.safeParse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const initialPlace: Place | null = prefill.success
    ? {
        id: `prefill-${prefill.data.lat},${prefill.data.lon}`,
        name: prefill.data.name,
        address: prefill.data.address,
        lat: prefill.data.lat,
        lon: prefill.data.lon,
        kind: "選んだ場所",
        source: "gsi",
      }
    : null;

  const { supabase } = await getUser();
  const [gears, diaries] = await Promise.all([
    supabase.from("gears").select("id", { count: "exact", head: true }),
    supabase.from("diary_entries").select("id", { count: "exact", head: true }),
  ]);
  return (
    <DiagnoseForm
      // 別の場所・日付で来たときはフォームを作り直す
      key={initialPlace ? `${initialPlace.id}-${prefill.data?.date}` : "blank"}
      gearCount={gears.count ?? 0}
      diaryCount={diaries.count ?? 0}
      initialPlace={initialPlace}
      initialDate={prefill.success ? prefill.data.date ?? null : null}
    />
  );
}
