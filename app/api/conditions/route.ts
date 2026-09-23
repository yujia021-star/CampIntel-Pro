import { z } from "zod";
import { fetchElevation } from "@/lib/geo/places";
import { getUser } from "@/lib/supabase/server";
import { clampNights, fetchForecast } from "@/lib/weather/forecast";

const Query = z.object({
  lat: z.coerce.number().min(20).max(46),
  lon: z.coerce.number().min(122).max(154),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => v || null),
  nights: z.string().optional().transform(clampNights),
});

/** 選んだ場所の標高と、予定日の天気予報を返す */
export async function GET(request: Request) {
  const { user } = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = Query.safeParse(params);
  if (!parsed.success) return Response.json({ error: "invalid_input" }, { status: 400 });
  const { lat, lon, date, nights } = parsed.data;

  const [elevation_m, forecast] = await Promise.all([fetchElevation(lat, lon), fetchForecast(lat, lon, date, nights)]);
  return Response.json({ elevation_m, forecast });
}
