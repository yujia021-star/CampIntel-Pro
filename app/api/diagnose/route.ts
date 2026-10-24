import { bestPlace } from "@/lib/ai/place-lookup";
import { aiErrorResponse } from "@/lib/ai/client";
import { insertWithFallback } from "@/lib/db/compat";
import { finalizeDiagnosis } from "@/lib/diagnosis";
import type { Gear, PlaceRef } from "@/lib/domain";
import { loadExperience } from "@/lib/experience-server";
import { fetchElevation } from "@/lib/geo/places";
import { ruleDiagnosis } from "@/lib/rules/diagnose";
import { getUser } from "@/lib/supabase/server";
import { parseDiagnoseInput } from "@/lib/validation/plan";
import { fetchForecast, todayJst, type ForecastResult } from "@/lib/weather/forecast";

// 診断はルールだけで組み立てる（AIを使わない。すぐ出て、料金0円、同じ条件なら毎回同じ結果）。
// 詳しい相談は、結果画面の「いつものAIに相談」から利用者自身のAIで行う。
export const maxDuration = 60;

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = parseDiagnoseInput(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: "invalid_input", message: parsed.message }, { status: 400 });
  const plan = { ...parsed.plan };

  try {
    // 場所を選んでいれば、標高と天気予報をサーバー側で取り直す（クライアントの表示値は信用しない）。
    // 選ばずに診断した場合も、名前からいちばん当てはまる場所を自動で選んで予報を使う。
    const found = parsed.place ? null : await bestPlace(supabase, user.id, plan.campsite);
    const place = parsed.place ?? (found && { name: found.name, address: found.address, lat: found.lat, lon: found.lon });
    const [gearsRes, elevation, weather, experience] = await Promise.all([
      supabase.from("gears").select("*").order("created_at"),
      place ? fetchElevation(place.lat, place.lon) : Promise.resolve(null),
      place ? fetchForecast(place.lat, place.lon, plan.planned_date, plan.nights) : Promise.resolve<ForecastResult | null>(null),
      // 経験レベルが取れなくても診断はできるので、失敗は無視する
      loadExperience(supabase, user).catch(() => null),
    ]);
    if (gearsRes.error) throw gearsRes.error;
    const gears = gearsRes.data as Gear[];
    const location: PlaceRef | null = place ? { ...place, elevation_m: elevation, auto: Boolean(found) } : null;
    if (plan.elevation_m === null && elevation !== null) plan.elevation_m = elevation;
    if (weather?.available) {
      plan.expected_low_c ??= weather.forecast.stay.temp_min;
      plan.expected_high_c ??= weather.forecast.stay.temp_max;
    }

    const { personal, ...raw } = ruleDiagnosis({ plan, location, weather, gears, experience, today: todayJst() });
    const result = {
      ...finalizeDiagnosis(raw, gears, 0, { location, weather, plan: parsed.plan }),
      personal,
    };

    const saved = await insertWithFallback(supabase, "camp_plans", { ...plan, user_id: user.id, result }, ["nights"]);
    if (saved.error) console.error("[diagnose] failed to save plan", saved.error);

    return Response.json({ plan_id: saved.id, result });
  } catch (error) {
    // 場所のAI検索（bestPlace）の上限・エラーもここで扱う
    return aiErrorResponse(error);
  }
}
