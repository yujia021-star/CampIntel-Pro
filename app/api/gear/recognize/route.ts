import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { aiErrorResponse, anthropic, enforceRateLimit, model, requireParsed } from "@/lib/ai/client";
import { GEAR_RECOGNIZE_SYSTEM } from "@/lib/ai/prompts";
import { GearRecognitionSchema } from "@/lib/ai/schemas";
import { isCategory } from "@/lib/domain";
import { getUser } from "@/lib/supabase/server";
import { normalizeTags } from "@/lib/tags";

export const maxDuration = 60;

// クライアント側で長辺1568px以下のJPEGに縮小してから送る（Base64で約3MBまで許容）
const MAX_BASE64_LENGTH = 3_000_000;

const Body = z.object({
  media_type: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  data: z.string().min(1).max(MAX_BASE64_LENGTH).regex(/^[A-Za-z0-9+/=]+$/),
});

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_input", message: "画像を読み込めませんでした" }, { status: 400 });
  }

  try {
    await enforceRateLimit(supabase, user.id, "gear_recognize");
    const response = await anthropic().messages.parse({
      model: model(),
      max_tokens: 4000,
      system: GEAR_RECOGNIZE_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: parsed.data.media_type, data: parsed.data.data } },
            { type: "text", text: "この写真のキャンプギアを特定してください。" },
          ],
        },
      ],
      output_config: { effort: "low", format: zodOutputFormat(GearRecognitionSchema) },
    });
    const out = requireParsed(response);
    return Response.json({
      recognized: out.recognized && out.name.trim() !== "",
      name: out.name.trim(),
      tags: normalizeTags(out.tags),
      category: isCategory(out.category) ? out.category : "other",
    });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
