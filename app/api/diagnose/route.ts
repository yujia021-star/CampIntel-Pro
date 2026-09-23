import { createHash } from "node:crypto";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { aiErrorResponse, anthropic, enforceRateLimit, model, requireParsed } from "@/lib/ai/client";
import { buildDiagnosisPrompt, DIAGNOSIS_SYSTEM, type DiaryWithForecast } from "@/lib/ai/prompts";
import { insertWithFallback } from "@/lib/db/compat";
import { DiagnosisOutputSchema } from "@/lib/ai/schemas";
import { finalizeDiagnosis } from "@/lib/diagnosis";
import type { CampPlanInput, DiagnosisResult, DiaryEntry, Gear, PlaceRef } from "@/lib/domain";
import { bestPlace } from "@/lib/ai/place-lookup";
import { loadExperience } from "@/lib/experience-server";
import { fetchElevation } from "@/lib/geo/places";
import { getUser } from "@/lib/supabase/server";
import { parseDiagnoseInput } from "@/lib/validation/plan";
import { planMonth, pickRegionRisks, stableStringify, weatherRisks, type RegionRisks } from "@/lib/stable-risks";
import { fetchForecast, todayJst, type ForecastResult } from "@/lib/weather/forecast";

export const maxDuration = 120;

// 直近何件の日記を診断に反映するか
const DIARY_LIMIT = 5;
// 同じ条件の診断を使い回す期間（予報が同じでも、1日たったら作り直す）
const REUSE_HOURS = 24;
// 地域リスクを探すときに見る、過去の診断の件数
const REGION_LOOKBACK = 20;

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  // 「もう一度診断する」では、前回の結果も地域リスクも使わずに作り直す
  const force = body?.force === true;
  const parsed = parseDiagnoseInput(body);
  if (!parsed.ok) return Response.json({ error: "invalid_input", message: parsed.message }, { status: 400 });
  const plan = { ...parsed.plan };

  try {
    // 場所を選んでいれば、標高と天気予報をサーバー側で取り直す（クライアントの表示値は信用しない）。
    // 選ばずに診断した場合も、名前からいちばん当てはまる場所を自動で選んで予報を使う。
    const found = parsed.place ? null : await bestPlace(supabase, user.id, plan.campsite);
    const place = parsed.place ?? (found && { name: found.name, address: found.address, lat: found.lat, lon: found.lon });
    const [gearsRes, diaryRes, elevation, weather, experience] = await Promise.all([
      supabase.from("gears").select("*").order("created_at"),
      supabase.from("diary_entries").select("*").order("date", { ascending: false }).limit(DIARY_LIMIT),
      place ? fetchElevation(place.lat, place.lon) : Promise.resolve(null),
      place ? fetchForecast(place.lat, place.lon, plan.planned_date, plan.nights) : Promise.resolve<ForecastResult | null>(null),
      // 経験レベルが取れなくても診断はできるので、失敗は無視する
      loadExperience(supabase, user).catch(() => null),
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

    // 条件がまったく同じ診断が最近あれば、AIを呼ばずにその結果を返す（料金をかけず、結果もぶれない）
    const fingerprint = diagnosisFingerprint({ plan, location, weather, gears, diaries, experience });
    if (!force) {
      const since = new Date(Date.now() - REUSE_HOURS * 3600_000).toISOString();
      const { data: same } = await supabase
        .from("camp_plans")
        .select("id, created_at, result")
        .eq("result->>fingerprint", fingerprint)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      const hit = same?.[0] as { id: string; created_at: string; result: DiagnosisResult } | undefined;
      if (hit?.result) return Response.json({ plan_id: hit.id, result: hit.result, reused_at: hit.created_at });
    }

    await enforceRateLimit(supabase, user.id, "diagnose");

    // 天気のリスクは予報の数字から決まったルールで出す。季節・地域のリスクは同じ場所・同じ月の前回の診断を使う
    const fixedWeather = weather?.available ? weatherRisks(weather.forecast.stay, plan.nights) : null;
    let fixedRegion: RegionRisks | null = null;
    if (location && !force) {
      const { data: previous } = await supabase
        .from("camp_plans")
        .select("planned_date, created_at, result")
        .order("created_at", { ascending: false })
        .limit(REGION_LOOKBACK);
      fixedRegion = pickRegionRisks(previous ?? [], location, planMonth(plan.planned_date, todayJst()));
    }
    const fixedRisks = [...(fixedWeather ?? []), ...(fixedRegion ? [...fixedRegion.environment, ...fixedRegion.bio] : [])];

    // リスク分析・マッチング・パッキングリストを1回の呼び出しでまとめて生成する
    const response = await anthropic().messages.parse({
      model: model(),
      max_tokens: 16000,
      system: DIAGNOSIS_SYSTEM,
      messages: [{ role: "user", content: buildDiagnosisPrompt(plan, gears, diaries, { location, weather, experience, fixedRisks }) }],
      output_config: { effort: "medium", format: zodOutputFormat(DiagnosisOutputSchema) },
    });
    const raw = requireParsed(response);
    const result = {
      ...finalizeDiagnosis(raw, gears, diaries.length, {
        location,
        weather,
        plan: parsed.plan,
        fixed: { weather: fixedWeather, region: fixedRegion },
      }),
      fingerprint,
    };

    const saved = await insertWithFallback(supabase, "camp_plans", { ...plan, user_id: user.id, result }, ["nights"]);
    if (saved.error) console.error("[diagnose] failed to save plan", saved.error);

    return Response.json({ plan_id: saved.id, result });
  } catch (error) {
    return aiErrorResponse(error);
  }
}

/**
 * 診断の条件の指紋。場所・日程・入力・マイギア・日記・経験・予報の数字が同じなら同じ値になる。
 * 予報は取得時刻を除いて数字だけを見る（1時間ごとに更新されても数字が同じなら同じ条件）。
 */
function diagnosisFingerprint(c: {
  plan: CampPlanInput;
  location: PlaceRef | null;
  weather: ForecastResult | null;
  gears: Gear[];
  diaries: DiaryWithForecast[];
  experience: Awaited<ReturnType<typeof loadExperience>> | null;
}): string {
  const f = c.weather?.available ? c.weather.forecast : null;
  const key = {
    v: 1,
    plan: { ...c.plan, expected_low_c: undefined, expected_high_c: undefined, elevation_m: undefined },
    place: c.location ? [c.location.lat.toFixed(4), c.location.lon.toFixed(4)] : null,
    weather: f ? { days: f.days, stay: f.stay } : (c.weather?.available === false ? c.weather.reason : null),
    gears: c.gears.map((g) => [g.id, g.name, g.category, g.is_base, g.tags]).sort(),
    diaries: c.diaries.map((d) => [d.id, d.forecast ?? null]),
    experience: c.experience
      ? [c.experience.experience.level, c.experience.experience.blank, c.experience.tendency?.summary ?? null]
      : null,
  };
  return createHash("sha256").update(stableStringify(key)).digest("hex");
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
