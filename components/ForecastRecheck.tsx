"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { diagnoseHref } from "@/app/(app)/weather/WeatherExplorer";
import type { PlaceRef } from "@/lib/domain";
import type { Forecast, ForecastResult } from "@/lib/weather/forecast";

type Stay = Forecast["stay"];

const ROWS: { key: keyof Stay; label: string; unit: string; threshold: number }[] = [
  { key: "temp_min", label: "最低気温", unit: "℃", threshold: 2 },
  { key: "temp_max", label: "最高気温", unit: "℃", threshold: 2 },
  { key: "precip_prob_max", label: "降水確率", unit: "%", threshold: 20 },
  { key: "precip_total_mm", label: "降水量", unit: "mm", threshold: 5 },
  { key: "gust_max_ms", label: "最大瞬間風速", unit: "m/s", threshold: 3 },
];

/** 保存した予報と最新の予報で、目安以上に変わった項目 */
export function forecastChanges(saved: Stay, latest: Stay) {
  return ROWS.flatMap((r) => {
    const a = saved[r.key];
    const b = latest[r.key];
    if (a === null || b === null || Math.abs(b - a) < r.threshold) return [];
    return [{ label: r.label, from: `${a}${r.unit}`, to: `${b}${r.unit}` }];
  });
}

/**
 * 履歴の診断を開いたときに、同じ場所・日程の最新の予報を取り直して、診断のときから変わっていないかを見せる。
 * 予報は1時間ごとに更新されるので、出発前にもう一度確かめられるようにする（AIは使わない）。
 */
export function ForecastRecheck({
  location,
  plannedDate,
  nights,
  saved,
}: {
  location: PlaceRef;
  plannedDate: string;
  nights: number;
  saved: ForecastResult | null | undefined;
}) {
  const [latest, setLatest] = useState<ForecastResult | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      lat: String(location.lat),
      lon: String(location.lon),
      date: plannedDate,
      nights: String(nights),
    });
    const controller = new AbortController();
    fetch(`/api/conditions?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => json?.forecast && setLatest(json.forecast as ForecastResult))
      .catch(() => {});
    return () => controller.abort();
  }, [location.lat, location.lon, plannedDate, nights]);

  // 予定日が過ぎた・まだ先すぎるなど、比べられないときは何も出さない
  if (!latest?.available) return null;
  const again = diagnoseHref(location, plannedDate, nights);
  if (!saved?.available) {
    return (
      <div className="card recheck">
        🌦️ 診断のときは予報がありませんでしたが、今は予報が出ています。
        <Link href={again} className="btn btn-primary btn-sm">
          最新の予報で診断する
        </Link>
      </div>
    );
  }
  const changes = forecastChanges(saved.forecast.stay, latest.forecast.stay);
  if (changes.length === 0) {
    return <div className="card recheck muted">✅ 最新の予報を確認しました。診断のときから大きな変化はありません。</div>;
  }
  return (
    <div className="card recheck recheck-changed">
      <b>🌦️ 診断のときから予報が変わっています</b>
      <ul>
        {changes.map((c) => (
          <li key={c.label}>
            {c.label}: {c.from} → <b>{c.to}</b>
          </li>
        ))}
      </ul>
      <Link href={again} className="btn btn-primary btn-sm">
        最新の予報でもう一度診断する
      </Link>
    </div>
  );
}
