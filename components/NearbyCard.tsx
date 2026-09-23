"use client";

import { useState } from "react";
import { fetchNearby, type NearbyPlace } from "@/lib/geo/nearby";
import { nearbyCategoriesFor, nearbyRouteUrl, routeFromUrl, type LatLon, type NearbyKind } from "@/lib/links";

type State =
  | { status: "loading" }
  | { status: "done"; places: NearbyPlace[]; fallback: string[] | null }
  | { status: "error"; errors: string[] };

/**
 * 周辺施設。種類を押すと、診断した場所から近い順に候補を出し、
 * それぞれ「診断した場所を出発地にした経路」を Google マップで開く。
 * 候補は OpenStreetMap（無料）をブラウザから直接引く。取れないときは Google マップの検索に任せる。
 */
export function NearbyCard({
  location,
  companions,
}: {
  location: LatLon & { name: string; address?: string | null };
  companions?: string | null;
}) {
  const [open, setOpen] = useState<NearbyKind | null>(null);
  const [results, setResults] = useState<Partial<Record<NearbyKind, State>>>({});
  const categories = nearbyCategoriesFor(companions);

  function select(kind: NearbyKind) {
    setOpen(open === kind ? null : kind);
    // 一度調べた種類はこの画面では調べ直さない
    if (results[kind]?.status === "done" || results[kind]?.status === "loading") return;
    setResults((r) => ({ ...r, [kind]: { status: "loading" } }));
    fetchNearby(kind, location)
      .catch((e: unknown) => ({ ok: false as const, errors: [String((e as Error)?.message ?? e)] }))
      .then((res) =>
        setResults((r) => ({
          ...r,
          [kind]: res.ok
            ? { status: "done", places: res.places, fallback: res.source.startsWith("nominatim") ? res.errors : null }
            : { status: "error", errors: res.errors },
        })),
      );
  }

  const current = open ? categories.find((c) => c.kind === open) : null;
  const state = open ? results[open] : undefined;

  return (
    <div className="card">
      <h2>♨️ 周辺施設</h2>
      <div className="link-row">
        {categories.map((c) => (
          <button
            key={c.kind}
            type="button"
            className="link-chip"
            aria-pressed={open === c.kind}
            aria-expanded={open === c.kind}
            onClick={() => select(c.kind)}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {current && (
        <div className="nearby-list">
          {state?.status === "loading" && <p className="muted">近くの{current.label}を探しています…</p>}
          {state?.status === "done" && state.places.length === 0 && (
            <p className="muted">地図データでは近くに見つかりませんでした。</p>
          )}
          {state?.status === "error" && (
            <>
              <p className="muted">候補を取得できませんでした。</p>
              {/* 原因を見られるように、どこでなぜ失敗したかを小さく出す */}
              <p className="muted" style={{ fontSize: "0.7rem" }}>
                {state.errors.join(" / ")}
              </p>
            </>
          )}
          {state?.status === "done" &&
            state.places.map((p) => (
              <a key={`${p.name}-${p.lat}`} className="nearby-item" href={routeFromUrl(location, p)} target="_blank" rel="noreferrer">
                <span className="nearby-name">{p.name}</span>
                <span className="muted nearby-dist">約{p.distance_km}km</span>
                <span className="nearby-go">行き方 ›</span>
              </a>
            ))}
          {state?.status === "done" && state.fallback && (
            // 詳しい地図データに届かず名前で探したとき。原因を見られるように小さく出す
            <p className="muted" style={{ fontSize: "0.7rem" }}>
              名前で探した結果です（{state.fallback.join(" / ")}）
            </p>
          )}
          <a href={nearbyRouteUrl(current.keyword, location)} target="_blank" rel="noreferrer" style={{ fontSize: "0.85rem" }}>
            Google マップで探す ›
          </a>
        </div>
      )}

      <p className="hint" style={{ marginBottom: 0 }}>
        種類を押すと近い順に候補を出します。「行き方」は「{location.name}」を出発地にして Google マップで開きます。距離は直線距離です。
        {companions ? `同行者「${companions}」に合わせて並べています。` : ""}
        <br />
        施設データ: © OpenStreetMap contributors。営業時間などはお店の情報で確認してください。
      </p>
    </div>
  );
}
