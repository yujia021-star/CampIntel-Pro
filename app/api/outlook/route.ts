import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { fetchOutlook } from "@/lib/weather/forecast";

const Query = z.object({
  lat: z.coerce.number().min(20).max(46),
  lon: z.coerce.number().min(122).max(154),
});

/** 選んだエリアの2週間の天気（日ごと） */
export async function GET(request: Request) {
  const { user } = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });
  const days = await fetchOutlook(parsed.data.lat, parsed.data.lon);
  if (!days) return Response.json({ error: "unavailable", message: "天気予報を取得できませんでした。時間をおいてお試しください。" }, { status: 502 });
  return Response.json({ days });
}
