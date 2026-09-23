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
          <h1 className="brand">
            CAMP<span>INTEL</span>
          </h1>
          <form action={signOut}>
            <button className="btn btn-ghost btn-sm" type="submit">
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
