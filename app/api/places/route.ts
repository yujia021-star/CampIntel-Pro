import { searchPlaces } from "@/lib/geo/places";
import { getUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { user } = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) {
    return Response.json({ error: "invalid_input", message: "2文字以上で入力してください" }, { status: 400 });
  }
  const places = await searchPlaces(q);
  return Response.json({ places });
}
