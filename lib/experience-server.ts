import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import type { DiagnosisResult } from "@/lib/domain";
import { todayJst } from "@/lib/weather/forecast";
import {
  computeExperience,
  CONDITIONS,
  feelTendency,
  PRIOR_NIGHTS,
  type Experience,
  type FeelTendency,
  type SelfReport,
  type Trip,
} from "./experience";

// 自己申告はユーザーのメタデータに保存する（本人の申告なので、本人が書き換えられてよい。追加のテーブル不要）
export const REPORT_KEY = "campintel_experience";

export const SelfReportSchema = z.object({
  prior_nights: z.enum(PRIOR_NIGHTS),
  conditions: z.array(z.enum(CONDITIONS)).max(4).transform((a) => [...new Set(a)]),
  windows: z
    .array(z.number().int().min(0).max(3))
    .max(4)
    .transform((a) => [...new Set(a)]),
  reported_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function readReport(user: User | null): SelfReport | null {
  const parsed = SelfReportSchema.safeParse(user?.user_metadata?.[REPORT_KEY]);
  return parsed.success ? parsed.data : null;
}

export interface ExperienceSummary {
  experience: Experience;
  tendency: FeelTendency | null;
  report: SelfReport | null;
}

/** 日記すべてと、ひも付いた診断の予報から、経験レベルと体感のクセを出す */
export async function loadExperience(supabase: SupabaseClient, user: User): Promise<ExperienceSummary> {
  const { data: rows } = await supabase.from("diary_entries").select("date, nights, weather, temp_feel, plan_id");
  const diaries = (rows ?? []) as { date: string; nights?: number | null; weather: string; temp_feel: string; plan_id?: string | null }[];

  const planIds = [...new Set(diaries.map((d) => d.plan_id).filter((id): id is string => Boolean(id)))];
  const mins = new Map<string, number | null>();
  if (planIds.length) {
    const { data: plans } = await supabase.from("camp_plans").select("id, weather:result->weather").in("id", planIds);
    for (const p of (plans ?? []) as { id: string; weather: DiagnosisResult["weather"] }[]) {
      mins.set(p.id, p.weather?.available ? p.weather.forecast.stay.temp_min : null);
    }
  }

  // 滞在を記録する前の日記は泊まり（眠りの質を聞いていた）なので1泊として扱う
  const trips: Trip[] = diaries.map((d) => ({
    date: d.date,
    nights: d.nights ?? 1,
    weather: d.weather,
    temp_feel: d.temp_feel,
    forecast_min: d.plan_id ? (mins.get(d.plan_id) ?? null) : null,
  }));
  const report = readReport(user);
  return { experience: computeExperience(trips, report, todayJst()), tendency: feelTendency(trips), report };
}
