"use client";

import Link from "next/link";
import { useState } from "react";
import { dayLabel } from "@/components/WeatherCard";
import type { Place } from "@/lib/geo/places";
import { campDayRating, type ForecastDay } from "@/lib/weather/forecast";

const v = (x: number | null, unit: string) => (x === null ? "—" : `${x}${unit}`);

/** 診断画面に場所と日付を引き継ぐリンク */
export function diagnoseHref(place: Pick<Place, "name" | "address" | "lat" | "lon">, date: string, nights?: number | null): string {
  const params = new URLSearchParams({
    name: place.name,
    address: place.address,
    lat: String(place.lat),
    lon: String(place.lon),
    date,
  });
  if (nights != null) params.set("nights", String(nights));
  return `/?${params}`;
}

export function WeatherExplorer() {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [days, setDays] = useState<ForecastDay[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const q = query.trim();
    if (q.length < 2) {
      setError("2文字以上で入力してください");
      return;
    }
    setSearching(true);
    setError(null);
    setCandidates(null);
    try {
      const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error(json?.message);
      setCandidates(json.places);
      if (json.places.length === 0) setError("見つかりませんでした。別の地名でも試してください。");
    } catch (e) {
      setError((e as Error).message || "検索に失敗しました");
    } finally {
      setSearching(false);
    }
  }

  async function choose(p: Place) {
    setPlace(p);
    setQuery(p.name);
    setCandidates(null);
    setDays(null);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/outlook?lat=${p.lat}&lon=${p.lon}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.days) throw new Error(json?.message);
      setDays(json.days);
    } catch (e) {
      setError((e as Error).message || "天気予報を取得できませんでした");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>🌤️ エリアの天気から行く日を決める</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          エリアやキャンプ場を選ぶと、2週間先までの天気と「キャンプ日和」の目安を出します。日を選べば、そのまま診断できます。
        </p>
        <div className="row" style={{ alignItems: "center" }}>
          <input
            value={query}
            maxLength={100}
            placeholder="例: 富士五湖、ふもとっぱら"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ flex: "0 0 auto", padding: "10px 12px" }}
            disabled={searching}
            onClick={search}
          >
            {searching ? "検索中…" : "🔍 検索"}
          </button>
        </div>
        {error && <div className="hint" style={{ color: "var(--red)" }}>{error}</div>}
        {candidates && candidates.length > 0 && (
          <div className="place-list">
            {candidates.map((p) => (
              <button key={p.id} type="button" className="place-item" onClick={() => choose(p)}>
                <b>{p.name}</b>
                <span className="basis">{p.kind}</span>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  {p.address}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <p className="muted" style={{ textAlign: "center" }}>天気予報を取得中…</p>}

      {place && days && (
        <div className="card">
          <h2>📅 {place.name} の2週間</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            日付をタップすると、その日（1泊）で診断画面に進みます。デイキャンプ・2泊は診断画面で変えられます。
          </p>
          <div className="outlook-list">
            {days.map((d) => {
              const r = campDayRating(d);
              const weekend = /\((土|日)\)$/.test(dayLabel(d.date));
              return (
                <Link key={d.date} href={diagnoseHref(place, d.date)} className={`outlook-day rate-${r.level}`}>
                  <div className="outlook-date">
                    <b className={weekend ? "weekend" : undefined}>{dayLabel(d.date)}</b>
                    <span className="outlook-icon">{d.icon}</span>
                  </div>
                  <div className="outlook-body">
                    <div>
                      <span className="outlook-rate">{r.label}</span>
                      <span className="muted" style={{ fontSize: "0.78rem" }}>
                        {" "}
                        {r.reason}
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {d.weather}・
                      <span style={{ color: "var(--red)" }}>{v(d.temp_max, "℃")}</span>/
                      <span style={{ color: "#3b82f6" }}>{v(d.temp_min, "℃")}</span>・☔{v(d.precip_prob_max, "%")}・🌬️
                      {v(d.wind_max_ms, "m/s")}
                    </div>
                  </div>
                  <span className="outlook-go">診断 ›</span>
                </Link>
              );
            })}
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            天気データ: Open-Meteo。先の日ほど予報は外れやすいので、近づいたら診断し直してください。
          </p>
        </div>
      )}
    </>
  );
}
