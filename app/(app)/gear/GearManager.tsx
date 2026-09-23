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
        <div className="gear-name">
          {gear.name}
          {gear.is_base && <span className="badge badge-base">定番</span>}
        </div>
        <div className="gear-tags">{gear.tags.map((t) => `#${t}`).join(" ")}</div>
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        <button
          className="btn btn-danger btn-sm"
          aria-pressed={gear.is_base}
          title={gear.is_base ? "定番装備から外す" : "定番装備にする"}
          disabled={pending}
          onClick={() => startTransition(async () => void (await setGearBase(gear.id, !gear.is_base)))}
        >
          {gear.is_base ? "★" : "☆"}
        </button>
        <button className="btn btn-danger btn-sm" title="編集" onClick={() => setEditing(true)}>
          ✎
        </button>
        <button
          className="btn btn-danger btn-sm"
          title="削除"
          aria-label={`${gear.name}を削除`}
          disabled={pending}
          onClick={() => {
            if (!confirm(`「${gear.name}」を削除しますか？`)) return;
            startTransition(async () => void (await deleteGear(gear.id)));
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function GearManager({ gears }: { gears: Gear[] }) {
  return (
    <>
      <div className="card">
        <h2>＋ ギアを登録</h2>
        <GearForm enableAi submitLabel="＋ ギアを追加" onSubmit={createGear} />
      </div>

      {gears.length === 0 && (
        <div className="card">
          <div className="empty">まだギアが登録されていません</div>
        </div>
      )}
      {CATEGORIES.map((cat) => {
        const items = gears.filter((g) => g.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="card">
            <h2>{CATEGORY_LABELS[cat]}</h2>
            {items.map((g) => (
              <GearRow key={g.id} gear={g} />
            ))}
          </div>
        );
      })}
    </>
  );
}
