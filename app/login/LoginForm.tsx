"use client";

import { useActionState, useState } from "react";
import { signIn, type LoginState } from "@/lib/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, { status: "idle" });
  // 送信後にフォームがリセットされてもメールアドレスは残す
  const [email, setEmail] = useState("");

  return (
    <form action={action} style={{ textAlign: "left" }}>
      <div className="field">
        <label htmlFor="email">メールアドレス</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">パスワード</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.status === "error" && <p className="error">{state.message}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "ログイン中..." : "ログイン"}
      </button>
    </form>
  );
}
