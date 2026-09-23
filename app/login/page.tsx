import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { user } = await getUser();
  if (user) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="container" style={{ paddingTop: "18vh" }}>
      <div className="card" style={{ textAlign: "center", padding: 28 }}>
        <h1 className="brand" style={{ marginBottom: 6 }}>
          CAMP<span>INTEL</span>
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>
          招待されたメールアドレスでログイン
        </p>
        {error === "link" && <p className="error">リンクが無効か期限切れです。もう一度送信してください。</p>}
        <LoginForm />
      </div>
    </div>
  );
}
