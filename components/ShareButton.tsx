"use client";

import { useState, useTransition } from "react";
import { createShareLink, stopSharing } from "@/lib/actions/share";

/** 診断結果を、ログインしていない人にも見られるリンクで共有する */
export function ShareButton({ planId, title }: { planId: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function share() {
    setMessage(null);
    startTransition(async () => {
      const r = await createShareLink(planId);
      if (!r.ok || !r.token) {
        setMessage(r.ok ? "共有リンクを作れませんでした。" : r.message);
        return;
      }
      const link = `${location.origin}/s/${r.token}`;
      setUrl(link);
      // スマホは共有シート（LINE など）を開き、使えなければコピーする
      try {
        if (navigator.share) {
          await navigator.share({ title: `${title} のキャンプ診断`, url: link });
          return;
        }
      } catch {
        // キャンセルされたときは下のリンク表示だけにする
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        setMessage("リンクをコピーしました。");
      } catch {
        setMessage("下のリンクを長押ししてコピーしてください。");
      }
    });
  }

  function stop() {
    if (!confirm("共有をやめますか？これまでに送ったリンクは見られなくなります。")) return;
    startTransition(async () => {
      const r = await stopSharing(planId);
      if (r.ok) {
        setUrl(null);
        setMessage("共有をやめました。");
      } else setMessage(r.message);
    });
  }

  return (
    <div>
      <button type="button" className="btn btn-secondary" style={{ marginTop: 0 }} disabled={pending} onClick={share}>
        {pending ? "準備中…" : "📤 診断結果をシェア"}
      </button>
      <p className="hint">リンクを知っている人は、ログインしなくても見られます（日記は見えません。持ち物のマイギアは見えます）。</p>
      {url && (
        <div className="place-selected" style={{ wordBreak: "break-all" }}>
          <a href={url} target="_blank" rel="noreferrer">
            {url}
          </a>
          <div>
            <button type="button" className="btn btn-danger btn-sm" style={{ paddingLeft: 0 }} disabled={pending} onClick={stop}>
              共有をやめる
            </button>
          </div>
        </div>
      )}
      {message && <div className="hint">{message}</div>}
    </div>
  );
}
