import { fetchNearby } from "@/lib/geo/nearby";
import { getUser } from "@/lib/supabase/server";

export const maxDuration = 30;

export async function GET(request: Request) {
  const { user } = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }
  const places = await fetchNearby(lat, lon);
  return Response.json({ places }, { headers: places ? { "Cache-Control": "private, max-age=3600" } : {} });
}
