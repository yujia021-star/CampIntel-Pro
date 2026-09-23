import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { aiErrorResponse, anthropic, enforceRateLimit, model, requireParsed } from "@/lib/ai/client";
import { buildDiagnosisPrompt, DIAGNOSIS_SYSTEM } from "@/lib/ai/prompts";
import { DiagnosisOutputSchema } from "@/lib/ai/schemas";
import { finalizeDiagnosis } from "@/lib/diagnosis";
import type { DiaryEntry, Gear } from "@/lib/domain";
import { getUser } from "@/lib/supabase/server";
import { CampPlanInputSchema } from "@/lib/validation/plan";

export const maxDuration = 120;

// 直近何件の日記を診断に反映するか
const DIARY_LIMIT = 5;

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = CampPlanInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_input", message: parsed.error.issues[0]?.message ?? "入力が不正です" },
      { status: 400 },
    );
  }
  const plan = parsed.data;

  try {
    await enforceRateLimit(supabase, user.id, "diagnose");

    const [gearsRes, diaryRes] = await Promise.all([
      supabase.from("gears").select("*").order("created_at"),
      supabase.from("diary_entries").select("*").order("date", { ascending: false }).limit(DIARY_LIMIT),
    ]);
    if (gearsRes.error) throw gearsRes.error;
    if (diaryRes.error) throw diaryRes.error;
    const gears = gearsRes.data as Gear[];
    const diaries = diaryRes.data as DiaryEntry[];

    // リスク分析・マッチング・パッキングリストを1回の呼び出しでまとめて生成する
    const response = await anthropic().messages.parse({
      model: model(),
      max_tokens: 16000,
      system: DIAGNOSIS_SYSTEM,
      messages: [{ role: "user", content: buildDiagnosisPrompt(plan, gears, diaries) }],
      output_config: { effort: "medium", format: zodOutputFormat(DiagnosisOutputSchema) },
    });
    const raw = requireParsed(response);
    const result = finalizeDiagnosis(raw, gears, diaries.length);

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
