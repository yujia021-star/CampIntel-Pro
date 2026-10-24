"use client";

import { useState } from "react";
import { CONSULT_SERVICES, consultText } from "@/lib/consult";
import type { DiagnosisResult } from "@/lib/domain";

/**
 * 「いつものAIに相談」。診断の結果と自分の道具・クセをまとめた文章をコピーして、利用者のAIアプリを開く。
 * 会話は利用者のAIで行うので、このアプリにはAIの料金がかからない。
 */
export function ConsultAI({
  result,
  campsite,
  companions,
  transport,
}: {
  result: DiagnosisResult;
  campsite?: string | null;
  companions?: string | null;
  transport?: string | null;
}) {
  const text = consultText(result, { campsite, companions, transport });
  const [message, setMessage] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);

  // クリックの中ですぐコピーを始める（iPhoneのSafariは、ボタンを押した直後でないとコピーできない）
  function copy(then: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => setMessage(then))
      .catch(() => {
        setShowText(true);
        setMessage("自動でコピーできませんでした。下の文章を長押ししてコピーしてください。");
      });
  }

  return (
    <div className="card consult">
      <h2>💬 いつものAIに相談</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        「もっと詳しく」「別のキャンプ場は？」は、普段使っているAIで。この診断と、あなたのギア・クセをまとめた文章を渡します。
      </p>
      <div className="consult-buttons">
        {CONSULT_SERVICES.map((s) => (
          <a
            key={s.name}
            className="btn btn-primary"
            href={s.url(text)}
            target="_blank"
            rel="noreferrer"
            onClick={() => copy(`コピーしました。${s.name}に貼り付けて相談してください。`)}
          >
            {s.name}で相談
          </a>
        ))}
      </div>
      <button type="button" className="btn btn-secondary" onClick={() => copy("コピーしました。好きなAIに貼り付けてください。")}>
        文章をコピーだけする
      </button>
      {message && <p className="hint">{message}</p>}
      <details className="more" open={showText}>
        <summary>渡す文章を見る</summary>
        <pre className="consult-text">{text}</pre>
      </details>
    </div>
  );
}
