import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Supabase の無料プランは1週間ほどアクセスがないと止まる。
// Vercel の Cron（vercel.json）から1日1回呼び、データベースに軽く問い合わせて止まらないようにする。
// RLS で中身は返らないので、ログインなしで呼ばれても何も漏れない。
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient(env.supabaseUrl(), env.supabaseAnonKey(), { auth: { persistSession: false } });
  const { error } = await supabase.from("gears").select("id", { head: true, count: "exact" });
  if (error) return Response.json({ ok: false }, { status: 502 });
  return Response.json({ ok: true });
}
