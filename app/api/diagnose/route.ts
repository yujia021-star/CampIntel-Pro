import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { aiErrorResponse, anthropic, enforceRateLimit, model, requireParsed } from "@/lib/ai/client";
import { buildDiagnosisPrompt, DIAGNOSIS_SYSTEM } from "@/lib/ai/prompts";
import { DiagnosisOutputSchema } from "@/lib/ai/schemas";
import { finalizeDiagnosis } from "@/lib/diagnosis";
import type { DiaryEntry, Gear, PlaceRef } from "@/lib/domain";
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

    // 場所を選んでいれば、標高と天気予報をサーバー側で取り直す（クライアントの表示値は信用しない）
    const place = parsed.place;
    const [gearsRes, diaryRes, elevation, weather] = await Promise.all([
      supabase.from("gears").select("*").order("created_at"),
      supabase.from("diary_entries").select("*").order("date", { ascending: false }).limit(DIARY_LIMIT),
      place ? fetchElevation(place.lat, place.lon) : Promise.resolve(null),
      place ? fetchForecast(place.lat, place.lon, plan.planned_date) : Promise.resolve<ForecastResult | null>(null),
    ]);
    const location: PlaceRef | null = place ? { ...place, elevation_m: elevation } : null;
    if (plan.elevation_m === null && elevation !== null) plan.elevation_m = elevation;
    if (weather?.available) {
      plan.expected_low_c ??= weather.forecast.stay.temp_min;
      plan.expected_high_c ??= weather.forecast.stay.temp_max;
    }
    if (gearsRes.error) throw gearsRes.error;
    if (diaryRes.error) throw diaryRes.error;
    const gears = gearsRes.data as Gear[];
    const diaries = diaryRes.data as DiaryEntry[];

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

    const { data: saved, error: saveError } = await supabase
      .from("camp_plans")
      .insert({ ...plan, user_id: user.id, result })
      .select("id")
      .single();
    if (saveError) console.error("[diagnose] failed to save plan", saveError);

    return Response.json({ plan_id: saved?.id ?? null, result });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
