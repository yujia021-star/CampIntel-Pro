"use client";

import { useEffect, useState } from "react";
import type { NearbyPlace } from "@/lib/geo/nearby";
import { mapsSearchUrl, nearbyCategoriesFor, routeLinks, type LatLon } from "@/lib/links";

/**
 * 地図アプリでの行き方と、周辺施設（温泉・買い出しなど）。
 * 施設の名前と距離は OpenStreetMap から取る。取れないとき（共有ページ・通信エラー）は
 * 地図アプリで探すリンクだけを出す。
 */
export function NearbyCard({
  location,
  companions,
  fetchNames = true,
}: {
  location: LatLon & { name: string };
  companions?: string | null;
  fetchNames?: boolean;
}) {
  const [places, setPlaces] = useState<NearbyPlace[] | null>(null);
  const [loading, setLoading] = useState(fetchNames);
  const route = routeLinks(location);
  const categories = nearbyCategoriesFor(companions);

  useEffect(() => {
    if (!fetchNames) return;
    const controller = new AbortController();
    fetch(`/api/nearby?lat=${location.lat}&lon=${location.lon}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setPlaces(json?.places ?? null))
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [location.lat, location.lon, fetchNames]);

  return (
    <div className="card">
      <h2>🗺️ 行き方と周辺施設</h2>
      <div className="link-row">
        <a className="link-chip" href={route.google} target="_blank" rel="noreferrer">
          🚗 Googleマップで行き方
        </a>
        <a className="link-chip" href={route.apple} target="_blank" rel="noreferrer">
          🍎 Appleマップで行き方
        </a>
      </div>
      {companions && <p className="hint">同行者「{companions}」に合わせて並べています。</p>}
      {categories.map((c) => {
        const items = (places ?? []).filter((p) => p.kind === c.kind);
        return (
          <div key={c.kind} className="nearby-group">
            <div className="nearby-head">
              <span>
                {c.icon} {c.label}
              </span>
              <a href={mapsSearchUrl(c.keyword, location)} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem", fontWeight: 400 }}>
                地図で探す ›
              </a>
            </div>
            {items.map((p) => (
              <div key={`${p.name}-${p.lat}`} className="nearby-item">
                <span>
                  {p.name} <span className="muted">約{p.distance_km}km</span>
                </span>
                <a href={routeLinks(p).google} target="_blank" rel="noreferrer">
                  行き方
                </a>
              </div>
            ))}
            {c.osm && fetchNames && !loading && places && items.length === 0 && (
              <div className="nearby-item muted">地図データには近くに見つかりませんでした</div>
            )}
          </div>
        );
      })}
      {loading && <p className="hint">近くの施設を探しています…</p>}
      <p className="hint" style={{ marginBottom: 0 }}>
        施設データ: © OpenStreetMap contributors。距離は直線距離です。営業時間・料金はお店の情報で確認してください。
      </p>
    </div>
  );
}
