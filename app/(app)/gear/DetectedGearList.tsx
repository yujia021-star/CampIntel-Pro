"use client";

import { useState, useTransition } from "react";
import { createGears } from "@/lib/actions/gear";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/domain";

export interface DetectedGear {
  name: string;
  tags: string[];
  category: Category;
}

interface Row extends DetectedGear {
  selected: boolean;
  is_base: boolean;
}

/** 1枚の写真から見つかった複数のギアを、選んでまとめて登録する */
export function DetectedGearList({
  items,
  onDone,
  onCancel,
}: {
  items: DetectedGear[];
  onDone: (count: number) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => items.map((x) => ({ ...x, selected: true, is_base: false })));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = rows.filter((r) => r.selected && r.name.trim());

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createGears(
          selected.map(({ name, tags, category, is_base }) => ({ name, tags, category, is_base })),
        );
        if (result.ok) onDone(selected.length);
        else setError(result.message);
      } catch {
        setError("登録に失敗しました。通信状況を確認してもう一度お試しください。");
      }
    });
  }

  return (
    <div className="detected">
      <div style={{ fontWeight: 700 }}>📷 写真から {rows.length} 個のギアが見つかりました</div>
      <div className="hint" style={{ marginBottom: 6 }}>
        登録するものにチェックを入れてください。名前とカテゴリは直せます。
      </div>
      {rows.map((r, i) => (
        <div key={i} className={`detected-row${r.selected ? "" : " off"}`}>
          <input
            type="checkbox"
            aria-label={`${r.name}を登録する`}
            checked={r.selected}
            onChange={(e) => update(i, { selected: e.target.checked })}
            style={{ width: "auto", marginTop: 12 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <input value={r.name} maxLength={100} onChange={(e) => update(i, { name: e.target.value })} />
            <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
              <select
                value={r.category}
                onChange={(e) => update(i, { category: e.target.value as Category })}
                aria-label="カテゴリ"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <label className="detected-base">
                <input
                  type="checkbox"
                  checked={r.is_base}
                  onChange={(e) => update(i, { is_base: e.target.checked })}
                  style={{ width: "auto" }}
                />
                定番
              </label>
            </div>
            {r.tags.length > 0 && <div className="gear-tags">{r.tags.map((t) => `#${t}`).join(" ")}</div>}
          </div>
        </div>
      ))}
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={onCancel} disabled={pending}>
          やめる
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          onClick={submit}
          disabled={pending || selected.length === 0}
        >
          {pending ? "登録中…" : `選んだ ${selected.length} 件を登録`}
        </button>
      </div>
    </div>
  );
}
