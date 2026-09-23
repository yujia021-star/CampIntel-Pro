import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { aiErrorResponse, anthropic, enforceRateLimit, model, requireParsed } from "@/lib/ai/client";
import { buildGearSuggestPrompt, GEAR_SUGGEST_SYSTEM } from "@/lib/ai/prompts";
import { GearSuggestionSchema } from "@/lib/ai/schemas";
import { isCategory } from "@/lib/domain";
import { getUser } from "@/lib/supabase/server";
import { normalizeTags } from "@/lib/tags";

export const maxDuration = 30;

const Body = z.object({ name: z.string().trim().min(1).max(100) });

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });

  try {
    await enforceRateLimit(supabase, user.id, "gear_suggest");
    const response = await anthropic().messages.parse({
      model: model(),
      max_tokens: 4000,
      system: GEAR_SUGGEST_SYSTEM,
      messages: [{ role: "user", content: buildGearSuggestPrompt(parsed.data.name) }],
      output_config: { effort: "low", format: zodOutputFormat(GearSuggestionSchema) },
    });
    const out = requireParsed(response);
    return Response.json({ tags: normalizeTags(out.tags), category: isCategory(out.category) ? out.category : "other" });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
