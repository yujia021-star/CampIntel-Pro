import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const { user } = await getUser();
  if (user) redirect("/");

  return (
    <div className="container" style={{ paddingTop: "18vh" }}>
      <div className="card" style={{ textAlign: "center", padding: 28 }}>
        <h1 className="brand" style={{ marginBottom: 6 }}>
          🏕️ campintel
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>
          招待されたアカウントでログイン
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
