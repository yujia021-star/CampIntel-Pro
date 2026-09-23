"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ActionResult, GearInput } from "@/lib/actions/gear";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/domain";
import { resizeImageToBase64 } from "@/lib/image";
import { parseTagInput } from "@/lib/tags";

const SUGGEST_DEBOUNCE_MS = 700;
const SUGGEST_MIN_LENGTH = 2;

const joinTags = (tags: string[]) => tags.join(", ");

interface Props {
  initial?: { name: string; tags: string[]; category: Category; is_base: boolean };
  submitLabel: string;
  onSubmit: (input: GearInput) => Promise<ActionResult>;
  onCancel?: () => void;
  /** 新規登録時のみ AI の自動提案と写真認識を使う */
  enableAi?: boolean;
}

export function GearForm({ initial, submitLabel, onSubmit, onCancel, enableAi = false }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [tagText, setTagText] = useState(initial ? joinTags(initial.tags) : "");
  const [category, setCategory] = useState<Category>(initial?.category ?? "other");
  const [isBase, setIsBase] = useState(initial?.is_base ?? false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [recognizing, setRecognizing] = useState(false);

  // ユーザーが手動編集した項目は AI の提案で上書きしない（非同期レース対策）。
  // 応答が返ってきた時点の値を見るため state ではなく ref で持つ。
  const tagsEdited = useRef(Boolean(initial));
  const categoryEdited = useRef(Boolean(initial));
  // 最新リクエストの番号。古い応答は捨てる
  const requestSeq = useRef(0);
  // 写真認識で名前を入れた直後は、その名前で再提案しない
  const skipSuggestFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uid = useId();

  useEffect(() => {
    if (!enableAi) return;
    const trimmed = name.trim();
    if (trimmed.length < SUGGEST_MIN_LENGTH || trimmed === skipSuggestFor.current) return;
    if (tagsEdited.current && categoryEdited.current) return;

    const seq = ++requestSeq.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("タグとカテゴリを提案中...");
      try {
        const res = await fetch("/api/gear/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
          signal: controller.signal,
        });
        if (seq !== requestSeq.current) return;
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) {
          setStatus(json?.message ?? null);
          return;
        }
        if (!tagsEdited.current) setTagText(joinTags(json.tags));
        if (!categoryEdited.current) setCategory(json.category);
        setStatus(
          tagsEdited.current || categoryEdited.current
            ? "AIが提案しました（手動編集した項目はそのままにしています）"
            : "AIが提案しました（編集できます）",
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError" && seq === requestSeq.current) setStatus(null);
      }
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, enableAi]);

  async function onPhoto(file: File) {
    setRecognizing(true);
    setError(null);
    setStatus("写真を解析中...");
    const seq = ++requestSeq.current;
    try {
      const image = await resizeImageToBase64(file);
      const res = await fetch("/api/gear/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(image),
      });
      const json = await res.json().catch(() => null);
      if (seq !== requestSeq.current) return;
      if (!res.ok || !json) {
        setStatus(null);
        setError(json?.message ?? `写真の解析に失敗しました（エラー ${res.status}）。時間をおいて再試行してください。`);
        return;
      }
      if (!json.recognized) {
        setStatus(null);
        setError("この画像は認識できませんでした。別の写真を試してください。");
        return;
      }
      // 写真認識は明示的な操作なので全項目を反映する（手動編集フラグもリセット）
      skipSuggestFor.current = json.name;
      setName(json.name);
      setTagText(joinTags(json.tags));
      setCategory(json.category);
      tagsEdited.current = false;
      categoryEdited.current = false;
      setStatus("写真から入力しました。内容を確認して「＋ ギアを追加」を押してください。");
    } catch (e) {
      setStatus(null);
      setError((e as Error).message || "写真を読み込めませんでした");
    } finally {
      setRecognizing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await onSubmit({ name, tags: parseTagInput(tagText), category, is_base: isBase });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (!initial) {
      // 新規登録後はフォームをリセット
      requestSeq.current++;
      skipSuggestFor.current = null;
      tagsEdited.current = false;
      categoryEdited.current = false;
      setName("");
      setTagText("");
      setCategory("other");
      setIsBase(false);
      setStatus(null);
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor={`${uid}-name`} style={{ marginTop: 0 }}>
        ギア名
      </label>
      <input
        id={`${uid}-name`}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (e.target.value.trim().length < SUGGEST_MIN_LENGTH) setStatus(null);
        }}
        maxLength={100}
        required
        placeholder="例: モンベル ダウンハガー800"
      />
      {enableAi && (
        // ボタンからコードで input.click() すると、アプリ内ブラウザでは写真選択が開かないことがある。
        // label で input を包み、タップをそのまま input に届ける。
        <label className={`btn btn-secondary btn-sm photo-btn${recognizing ? " disabled" : ""}`}>
          {recognizing ? "解析中…" : "📷 写真から入力"}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="visually-hidden"
            disabled={recognizing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPhoto(f);
            }}
          />
        </label>
      )}
      <label htmlFor={`${uid}-category`}>カテゴリ</label>
      <select
        id={`${uid}-category`}
        value={category}
        onChange={(e) => {
          categoryEdited.current = true;
          setCategory(e.target.value as Category);
        }}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <label htmlFor={`${uid}-tags`}>タグ{enableAi ? "（自動提案。編集も可能）" : ""}</label>
      <input
        id={`${uid}-tags`}
        value={tagText}
        onChange={(e) => {
          tagsEdited.current = true;
          setTagText(e.target.value);
        }}
        placeholder={enableAi ? "ギア名を入力すると自動で提案されます" : "防寒, 冬用"}
      />
      {status && <div className="hint">{status}</div>}
      <div className="checkbox-row">
        <input id={`${uid}-base`} type="checkbox" checked={isBase} onChange={(e) => setIsBase(e.target.checked)} />
        <label htmlFor={`${uid}-base`}>🏕️ いつも持っていく定番装備にする</label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row">
        {onCancel && (
          <button type="button" className="btn btn-ghost" style={{ marginTop: 18 }} onClick={onCancel}>
            キャンセル
          </button>
        )}
        <button className="btn btn-primary" type="submit" disabled={saving || recognizing}>
          {saving ? "保存中…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
