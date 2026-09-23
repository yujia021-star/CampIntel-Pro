"use client";

import { useState, useTransition } from "react";
import { createGear, deleteGear, setGearBase, updateGear } from "@/lib/actions/gear";
import { CATEGORIES, CATEGORY_LABELS, type Gear } from "@/lib/domain";
import { GearForm } from "./GearForm";

function GearRow({ gear }: { gear: Gear }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <div className="list-item" style={{ display: "block" }}>
        <GearForm
          initial={gear}
          submitLabel="更新"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            const r = await updateGear(gear.id, input);
            if (r.ok) setEditing(false);
            return r;
          }}
        />
      </div>
    );
  }

  return (
    <div className="list-item" style={{ opacity: pending ? 0.5 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          {gear.name} {gear.is_base && <span className="badge badge-base">定番</span>}
        </div>
        <div>
          {gear.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button
          className="btn btn-ghost btn-sm"
          aria-pressed={gear.is_base}
          title="定番装備の切り替え"
          disabled={pending}
          onClick={() => startTransition(async () => void (await setGearBase(gear.id, !gear.is_base)))}
        >
          {gear.is_base ? "★" : "☆"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
          編集
        </button>
        <button
          className="btn btn-danger btn-sm"
          disabled={pending}
          onClick={() => {
            if (!confirm(`「${gear.name}」を削除しますか？`)) return;
            startTransition(async () => void (await deleteGear(gear.id)));
          }}
        >
          削除
        </button>
      </div>
    </div>
  );
}

export function GearManager({ gears }: { gears: Gear[] }) {
  const baseCount = gears.filter((g) => g.is_base).length;
  return (
    <>
      <div className="card">
        <h2>🎒 ギアを登録</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          名前を入れると AI がタグとカテゴリを提案します。📷 で写真からも登録できます。
        </p>
        <GearForm enableAi submitLabel="登録" onSubmit={createGear} />
      </div>

      <div className="card">
        <h2>マイギア（{gears.length}件・定番 {baseCount}件）</h2>
        {gears.length === 0 && <p className="muted">まだギアが登録されていません。</p>}
        {CATEGORIES.map((cat) => {
          const items = gears.filter((g) => g.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <h3>{CATEGORY_LABELS[cat]}</h3>
              {items.map((g) => (
                <GearRow key={g.id} gear={g} />
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
