"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionResult, GearInput } from "@/lib/actions/gear";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/domain";
import { resizeImageToBase64 } from "@/lib/image";
import { parseTagInput } from "@/lib/tags";

const SUGGEST_DEBOUNCE_MS = 700;

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
  const [tagText, setTagText] = useState(initial?.tags.map((t) => `#${t}`).join(" ") ?? "");
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

  useEffect(() => {
    if (!enableAi) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === skipSuggestFor.current) return;
    if (tagsEdited.current && categoryEdited.current) return;

    const seq = ++requestSeq.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("AIがタグを提案中…");
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
        if (!tagsEdited.current) setTagText((json.tags as string[]).map((t) => `#${t}`).join(" "));
        if (!categoryEdited.current) setCategory(json.category);
        setStatus("✨ AIの提案を反映しました（編集できます）");
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
    setStatus("写真からギアを認識中…");
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
        setError(json?.message ?? "写真の認識に失敗しました");
        return;
      }
      if (!json.recognized) {
        setStatus(null);
        setError("キャンプギアを認識できませんでした。別の写真を試すか、名前を入力してください。");
        return;
      }
      // 写真認識は明示的な操作なので全項目を反映する（手動編集フラグもリセット）
      skipSuggestFor.current = json.name;
      setName(json.name);
      setTagText((json.tags as string[]).map((t) => `#${t}`).join(" "));
      setCategory(json.category);
      tagsEdited.current = false;
      categoryEdited.current = false;
      setStatus("📷 写真から認識しました（編集できます）");
    } catch {
      setStatus(null);
      setError("写真を読み込めませんでした");
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
      setStatus("登録しました");
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="gear-name">ギア名</label>
        <div className="row" style={{ alignItems: "center" }}>
          <input
            id="gear-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            placeholder="例: モンベル ダウンハガー#3"
          />
          {enableAi && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: "0 0 auto" }}
                disabled={recognizing}
                onClick={() => fileInput.current?.click()}
                aria-label="写真から登録"
              >
                📷
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPhoto(f);
                }}
              />
            </>
          )}
        </div>
      </div>
      <div className="field">
        <label htmlFor="gear-tags">タグ（スペース区切り）</label>
        <input
          id="gear-tags"
          value={tagText}
          onChange={(e) => {
            tagsEdited.current = true;
            setTagText(e.target.value);
          }}
          placeholder="#防寒 #冬用"
        />
      </div>
      <div className="field">
        <label htmlFor="gear-category">カテゴリ</label>
        <select
          id="gear-category"
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
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", color: "var(--text)", marginBottom: 12 }}>
        <input type="checkbox" checked={isBase} onChange={(e) => setIsBase(e.target.checked)} style={{ width: "auto" }} />
        定番装備（毎回のパッキングリストに必ず含める）
      </label>
      {status && <p className="muted">{status}</p>}
      {error && <p className="error">{error}</p>}
      <div className="row">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
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
