import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { aiErrorResponse, anthropic, enforceRateLimit, model, requireParsed } from "@/lib/ai/client";
import { buildDiagnosisPrompt, DIAGNOSIS_SYSTEM, type DiaryWithForecast } from "@/lib/ai/prompts";
import { insertWithFallback } from "@/lib/db/compat";
import { DiagnosisOutputSchema } from "@/lib/ai/schemas";
import { finalizeDiagnosis } from "@/lib/diagnosis";
import type { DiagnosisResult, DiaryEntry, Gear, PlaceRef } from "@/lib/domain";
import { bestPlace } from "@/lib/ai/place-lookup";
import { fetchElevation } from "@/lib/geo/places";
import { getUser } from "@/lib/supabase/server";
import { parseDiagnoseInput } from "@/lib/validation/plan";
import { fetchForecast, type ForecastResult } from "@/lib/weather/forecast";

export const maxDuration = 120;

// 直近何件の日記を診断に反映するか
const DIARY_LIMIT = 5;

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = parseDiagnoseInput(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: "invalid_input", message: parsed.message }, { status: 400 });
  const plan = { ...parsed.plan };

  try {
    await enforceRateLimit(supabase, user.id, "diagnose");

    // 場所を選んでいれば、標高と天気予報をサーバー側で取り直す（クライアントの表示値は信用しない）。
    // 選ばずに診断した場合も、名前からいちばん当てはまる場所を自動で選んで予報を使う。
    const found = parsed.place ? null : await bestPlace(supabase, user.id, plan.campsite);
    const place = parsed.place ?? (found && { name: found.name, address: found.address, lat: found.lat, lon: found.lon });
    const [gearsRes, diaryRes, elevation, weather] = await Promise.all([
      supabase.from("gears").select("*").order("created_at"),
      supabase.from("diary_entries").select("*").order("date", { ascending: false }).limit(DIARY_LIMIT),
      place ? fetchElevation(place.lat, place.lon) : Promise.resolve(null),
      place ? fetchForecast(place.lat, place.lon, plan.planned_date, plan.nights) : Promise.resolve<ForecastResult | null>(null),
    ]);
    const location: PlaceRef | null = place ? { ...place, elevation_m: elevation, auto: Boolean(found) } : null;
    if (plan.elevation_m === null && elevation !== null) plan.elevation_m = elevation;
    if (weather?.available) {
      plan.expected_low_c ??= weather.forecast.stay.temp_min;
      plan.expected_high_c ??= weather.forecast.stay.temp_max;
    }
    if (gearsRes.error) throw gearsRes.error;
    if (diaryRes.error) throw diaryRes.error;
    const gears = gearsRes.data as Gear[];
    const diaries = await withPlanForecasts(supabase, diaryRes.data as DiaryEntry[]);

    // リスク分析・マッチング・パッキングリストを1回の呼び出しでまとめて生成する
    const response = await anthropic().messages.parse({
      model: model(),
      max_tokens: 16000,
      system: DIAGNOSIS_SYSTEM,
      messages: [{ role: "user", content: buildDiagnosisPrompt(plan, gears, diaries, { location, weather }) }],
      output_config: { effort: "medium", format: zodOutputFormat(DiagnosisOutputSchema) },
    });
    const raw = requireParsed(response);
    const result = finalizeDiagnosis(raw, gears, diaries.length, { location, weather, plan: parsed.plan });

    const saved = await insertWithFallback(supabase, "camp_plans", { ...plan, user_id: user.id, result }, ["nights"]);
    if (saved.error) console.error("[diagnose] failed to save plan", saved.error);

    return Response.json({ plan_id: saved.id, result });
  } catch (error) {
    return aiErrorResponse(error);
  }
}

/** 診断から書いた日記に、そのときの予報（滞在中の集計）を添える。予報と体感の差を次の診断に使うため */
async function withPlanForecasts(
  supabase: Awaited<ReturnType<typeof getUser>>["supabase"],
  diaries: DiaryEntry[],
): Promise<DiaryWithForecast[]> {
  const ids = [...new Set(diaries.map((d) => d.plan_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return diaries;
  const { data } = await supabase.from("camp_plans").select("id, result").in("id", ids);
  const stays = new Map(
    (data ?? []).map((p: { id: string; result: DiagnosisResult | null }) => {
      const w = p.result?.weather;
      return [p.id, w?.available ? w.forecast.stay : null];
    }),
  );
  return diaries.map((d) => ({ ...d, forecast: d.plan_id ? (stays.get(d.plan_id) ?? null) : null }));
}
