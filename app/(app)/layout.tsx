import { redirect } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import { BottomNav } from "@/components/BottomNav";
import { getUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getUser();
  if (!user) redirect("/login");

  return (
    <>
      <div className="container">
        <header className="header">
          <div>
            <h1 className="brand">🏕️ campintel AIアドバイザー</h1>
            <p className="sub">キャンプ計画とマイギアから、リスク分析とパッキングリストをAIが提案します</p>
          </div>
          <form action={signOut}>
            <button className="btn btn-ghost btn-sm" type="submit" style={{ flexShrink: 0 }}>
              ログアウト
            </button>
          </form>
        </header>
        {children}
      </div>
      <BottomNav />
    </>
  );
}
