import type { CampPlan, DiagnosisResult, DiaryEntry } from "@/lib/domain";
import { loadExperience } from "@/lib/experience-server";
import { getUser } from "@/lib/supabase/server";
import { DiaryManager, type PlanSummary } from "./DiaryManager";
import { ExperienceCard } from "./ExperienceCard";

/** 診断結果から、日記の表示・入力に使う要点だけを取り出す */
function summarize(plan: Pick<CampPlan, "id" | "campsite" | "planned_date" | "nights"> & { result: DiagnosisResult | null }): PlanSummary {
  const w = plan.result?.weather;
  return {
    id: plan.id,
    campsite: plan.result?.location?.name ?? plan.campsite,
    planned_date: plan.planned_date,
    nights: plan.nights ?? plan.result?.stay?.nights ?? null,
    forecast: w?.available ? w.forecast.stay : null,
  };
}

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { supabase, user } = await getUser();
  const { plan: fromPlanId } = await searchParams;
  const [entries, gears, exp] = await Promise.all([
    supabase.from("diary_entries").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("gears").select("name").order("name"),
    loadExperience(supabase, user!), // (app) のレイアウトで未ログインは弾いている
  ]);
  const diaries = (entries.data ?? []) as DiaryEntry[];

  // 日記にひも付いた診断と、「この計画の日記を書く」から来た診断をまとめて読む
  const ids = [...new Set([...diaries.map((d) => d.plan_id), fromPlanId].filter((id): id is string => Boolean(id)))];
  const { data: planRows } = ids.length
    ? await supabase.from("camp_plans").select("*").in("id", ids)
    : { data: [] as CampPlan[] };
  const plans = Object.fromEntries(((planRows ?? []) as CampPlan[]).map((p) => [p.id, summarize(p)]));

  return (
    <>
      <ExperienceCard experience={exp.experience} tendency={exp.tendency} report={exp.report} />
      <DiaryManager
        entries={diaries}
        gearNames={(gears.data ?? []).map((g: { name: string }) => g.name)}
        plans={plans}
        fromPlan={fromPlanId ? (plans[fromPlanId] ?? null) : null}
      />
    </>
  );
}
