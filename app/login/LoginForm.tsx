"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "@/lib/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") return <p className="success">{state.message}</p>;

  return (
    <form action={action} style={{ textAlign: "left" }}>
      <div className="field">
        <label htmlFor="email">メールアドレス</label>
        <input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      {state.status === "error" && <p className="error">{state.message}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "送信中..." : "ログインリンクを送る"}
      </button>
    </form>
  );
}
