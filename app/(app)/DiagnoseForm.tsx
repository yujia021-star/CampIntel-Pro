"use client";

import { useEffect, useRef, useState } from "react";
import { DiagnosisView } from "@/components/DiagnosisView";
import { LoadingOverlay } from "@/components/Loading";
import { WeatherCard } from "@/components/WeatherCard";
import type { DiagnosisResult } from "@/lib/domain";
import type { Place } from "@/lib/geo/places";
import type { ForecastResult } from "@/lib/weather/forecast";

// 選択肢はプロトタイプと同じ。datalist なので自由入力もできる
const OPTIONS = {
  terrain: ["林間", "湖畔", "高原", "海辺", "河原"],
  ground: ["固い土", "砂地", "芝生", "岩場", "ぬかるみ"],
  transport: ["車", "バイク", "公共交通機関", "徒歩"],
  companions: ["ソロ", "友人", "家族", "パートナー"],
};

function Suggest({ id, label, name, options }: { id: string; label: string; name: string; options: string[] }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} list={`${id}-list`} placeholder="選択または入力" autoComplete="off" />
      <datalist id={`${id}-list`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

const mapUrl = (p: { lat: number; lon: number }) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;

export function DiagnoseForm({ gearCount, diaryCount }: { gearCount: number; diaryCount: number }) {
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // 場所の検索
  const [campsite, setCampsite] = useState("");
  const [candidates, setCandidates] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [place, setPlace] = useState<Place | null>(null);

  // 予定日・標高・気温は、場所と日付から自動で入る（手で書き換えたらそれを優先）
  const [date, setDate] = useState("");
  const [elevation, setElevation] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const edited = useRef({ elevation: false, low: false, high: false });
  const [weather, setWeather] = useState<ForecastResult | null>(null);
  const [loadingConditions, setLoadingConditions] = useState(false);

  async function search() {
    const q = campsite.trim();
    if (q.length < 2) {
      setSearchError("2文字以上で入力してください");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setCandidates(null);
    try {
      const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error(json?.message);
      setCandidates(json.places);
      if (json.places.length === 0) setSearchError("見つかりませんでした。地名（例: 富士宮市 朝霧高原）でも試してください。");
    } catch (e) {
      setSearchError((e as Error).message || "検索に失敗しました");
    } finally {
      setSearching(false);
    }
  }

  function choose(p: Place) {
    setPlace(p);
    setCampsite(p.name);
    setCandidates(null);
  }

  // 場所か日付が変わったら、標高と天気予報を取り直す
  useEffect(() => {
    if (!place) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(place.lat), lon: String(place.lon) });
    if (date) params.set("date", date);
    (async () => {
      setLoadingConditions(true);
      try {
        const res = await fetch(`/api/conditions?${params}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok) throw new Error();
        if (!edited.current.elevation) setElevation(json.elevation_m == null ? "" : String(json.elevation_m));
        const w = json.forecast as ForecastResult;
        setWeather(w);
        if (w.available) {
          if (!edited.current.low && w.forecast.stay.temp_min !== null) setLow(String(w.forecast.stay.temp_min));
          if (!edited.current.high && w.forecast.stay.temp_max !== null) setHigh(String(w.forecast.stay.temp_max));
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setWeather(null);
      } finally {
        if (!controller.signal.aborted) setLoadingConditions(false);
      }
    })();
    return () => controller.abort();
  }, [place, date]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.result) {
        setError(json?.message ?? "診断に失敗しました。もう一度お試しください。");
        return;
      }
      setResult(json.result);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {pending && <LoadingOverlay message="診断中...(30〜60秒程度かかることがあります)" />}
      <form className="card" onSubmit={onSubmit}>
        <h2>📋 キャンプ計画</h2>

        <div className="field">
          <label htmlFor="campsite">キャンプ場名・地名</label>
          <div className="row" style={{ alignItems: "center" }}>
            <input
              id="campsite"
              name="campsite"
              required
              maxLength={100}
              placeholder="例: ふもとっぱら"
              value={campsite}
              onChange={(e) => {
                setCampsite(e.target.value);
                if (place && e.target.value !== place.name) setPlace(null);
              }}
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
              {searching ? "検索中…" : "🔍 場所を検索"}
            </button>
          </div>
          {searchError && <div className="hint" style={{ color: "var(--red)" }}>{searchError}</div>}
          {candidates && candidates.length > 0 && (
            <>
              <div className="hint">該当する場所を選んでください</div>
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
            </>
          )}
          {place && (
            <div className="place-selected">
              ✅ <b>{place.name}</b>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                {place.address}
              </div>
              <a href={mapUrl(place)} target="_blank" rel="noreferrer" style={{ fontSize: "0.85rem" }}>
                🗺️ 地図で場所を確認
              </a>
              <input type="hidden" name="place_name" value={place.name} />
              <input type="hidden" name="place_address" value={place.address} />
              <input type="hidden" name="place_lat" value={place.lat} />
              <input type="hidden" name="place_lon" value={place.lon} />
            </div>
          )}
          {!place && !candidates && (
            <div className="hint">検索して場所を選ぶと、標高と天気予報が自動で入ります（選ばなくても診断できます）</div>
          )}
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="planned_date">予定日</label>
            <input id="planned_date" name="planned_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="elevation_m">標高 (m)</label>
            <input
              id="elevation_m"
              name="elevation_m"
              type="number"
              inputMode="numeric"
              step="1"
              placeholder="例: 850"
              value={elevation}
              onChange={(e) => {
                edited.current.elevation = true;
                setElevation(e.target.value);
              }}
            />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="expected_low_c">予想最低気温 (℃)</label>
            <input
              id="expected_low_c"
              name="expected_low_c"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={low}
              onChange={(e) => {
                edited.current.low = true;
                setLow(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="expected_high_c">予想最高気温 (℃)</label>
            <input
              id="expected_high_c"
              name="expected_high_c"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={high}
              onChange={(e) => {
                edited.current.high = true;
                setHigh(e.target.value);
              }}
            />
          </div>
        </div>
        {loadingConditions && <div className="hint">標高と天気予報を取得中…</div>}

        <div className="row">
          <Suggest id="terrain" name="terrain" label="地形" options={OPTIONS.terrain} />
          <Suggest id="ground" name="ground" label="地面の性質" options={OPTIONS.ground} />
        </div>
        <div className="row">
          <Suggest id="transport" name="transport" label="移動手段" options={OPTIONS.transport} />
          <Suggest id="companions" name="companions" label="同行者" options={OPTIONS.companions} />
        </div>
        <div className="field">
          <label htmlFor="style">スタイル</label>
          <input id="style" name="style" maxLength={100} placeholder="例: まったり焚き火読書 / フリーサイト" />
        </div>

        <p className="hint">
          マイギア {gearCount}件・日記（直近{Math.min(diaryCount, 5)}件）を診断に反映します
        </p>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          🔍 診断する
        </button>
      </form>

      {!result && place && weather && <WeatherCard weather={weather} />}

      <div ref={resultRef}>{result && <DiagnosisView result={result} />}</div>
    </>
  );
}
