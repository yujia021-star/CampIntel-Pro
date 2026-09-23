import { findPlaces } from "@/lib/ai/place-lookup";
import { getUser } from "@/lib/supabase/server";

// 地図データで見つからないときは AI が Web 検索で調べるので、少し長めに待てるようにする
export const maxDuration = 60;

export async function GET(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) {
    return Response.json({ error: "invalid_input", message: "2文字以上で入力してください" }, { status: 400 });
  }
  const places = await findPlaces(supabase, user.id, q);
  return Response.json({ places });
}
