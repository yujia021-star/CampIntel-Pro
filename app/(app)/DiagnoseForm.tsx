"use client";

import { useEffect, useRef, useState } from "react";
import { DiagnosisView } from "@/components/DiagnosisView";
import { LoadingOverlay } from "@/components/Loading";
import { WeatherCard } from "@/components/WeatherCard";
import { NIGHTS_ICONS, NIGHTS_LABELS, NIGHTS_OPTIONS, type DiagnosisResult } from "@/lib/domain";
import type { Place } from "@/lib/geo/places";
import { addDays, type ForecastResult } from "@/lib/weather/forecast";
import { dayLabel } from "@/components/WeatherCard";

// 選択肢はプロトタイプと同じ。datalist なので自由入力もできる
const OPTIONS = {
  terrain: ["林間", "湖畔", "高原", "海辺", "河原"],
  ground: ["固い土", "砂地", "芝生", "岩場", "ぬかるみ"],
  transport: ["車", "バイク", "公共交通機関", "徒歩"],
  companions: ["ソロ", "友人", "家族", "パートナー"],
};

function Suggest({
  id,
  label,
  name,
  options,
  defaultValue,
  placeholder = "選択または入力",
}: {
  id: string;
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        list={`${id}-list`}
        placeholder={placeholder}
        autoComplete="off"
        defaultValue={defaultValue}
      />
      <datalist id={`${id}-list`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

// 移動手段・同行者・スタイルは毎回ほぼ同じなので、この端末に前回の値を覚えておく
const PREFS_KEY = "campintel:plan-prefs";
type Prefs = { transport?: string; companions?: string; style?: string };

function loadPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs;
  } catch {
    return {};
  }
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 保存できなくても診断には影響しない
  }
}

/** 次の土曜日（今日が土曜なら今日）を "YYYY-MM-DD" で返す。予定日の初期値に使う */
export function nextSaturday(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const mapUrl = (p: { lat: number; lon: number }) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;

export function DiagnoseForm({ gearCount, diaryCount }: { gearCount: number; diaryCount: number }) {
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // 場所の検索
  const [campsite, setCampsite] = useState("");
  const [candidates, setCandidates] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [place, setPlace] = useState<Place | null>(null);

  // 標高・気温は場所と予定日から自動で取得して表示する（入力欄にはしない）
  const [date, setDate] = useState(nextSaturday);
  // 泊数（0 = デイキャンプ）
  const [nights, setNights] = useState(1);
  const [elevation, setElevation] = useState<number | null>(null);
  const [weather, setWeather] = useState<ForecastResult | null>(null);
  const [loadingConditions, setLoadingConditions] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    // localStorage はブラウザでしか読めないので、表示後に読み込む
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(loadPrefs());
  }, []);

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
    setResult(null);
  }

  // 場所か日付が変わったら、標高と天気予報を取り直す
  useEffect(() => {
    if (!place) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(place.lat), lon: String(place.lon) });
    if (date) params.set("date", date);
    params.set("nights", String(nights));
    (async () => {
      setLoadingConditions(true);
      try {
        const res = await fetch(`/api/conditions?${params}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok) throw new Error();
        setElevation(json.elevation_m ?? null);
        setWeather(json.forecast as ForecastResult);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setElevation(null);
          setWeather(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingConditions(false);
      }
    })();
    return () => controller.abort();
  }, [place, date, nights]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (candidates && candidates.length > 0 && !place) {
      setError("上の候補から場所を選んでください（天気予報と標高を正しく取得するためです）。");
      return;
    }
    const body = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const nextPrefs = { transport: body.transport, companions: body.companions, style: body.style };
    savePrefs(nextPrefs);
    setPrefs(nextPrefs);
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
      setPlanId(json.plan_id ?? null);
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
                if (place && e.target.value !== place.name) {
                  setPlace(null);
                  setWeather(null);
                  setElevation(null);
                }
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
          {searching && (
            <div className="hint">地図データにないキャンプ場は AI が Web で調べるので、20秒ほどかかることがあります。</div>
          )}
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
              {place.source === "ai" && (
                <div className="hint" style={{ color: "var(--amber)", marginTop: 2 }}>
                  AI が Web で調べた場所です。地図で合っているか確認してください。
                </div>
              )}
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
            <div className="hint">
              「場所を検索」で候補から選ぶと確実です。選ばずに診断した場合は、名前からいちばん近い場所を自動で選びます
            </div>
          )}
        </div>

        <div className="field">
          <label>滞在</label>
          <div className="choice-row" role="group" aria-label="滞在">
            {NIGHTS_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className="choice-btn"
                aria-pressed={nights === n}
                onClick={() => {
                  setNights(n);
                  setResult(null);
                }}
              >
                {NIGHTS_ICONS[n]} {NIGHTS_LABELS[n]}
              </button>
            ))}
          </div>
          <input type="hidden" name="nights" value={nights} />
        </div>

        <div className="field">
          <label htmlFor="planned_date">{nights === 0 ? "日付" : "初日（チェックイン）"}</label>
          <input
            id="planned_date"
            name="planned_date"
            type="date"
            required
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setResult(null);
            }}
          />
          {date && nights > 0 && (
            <div className="hint">
              {dayLabel(date)} 〜 {dayLabel(addDays(date, nights))}（{NIGHTS_LABELS[nights]}）
            </div>
          )}
        </div>

        {place && (
          <div className="auto-conditions">
            <div className="cond-row" style={{ borderTop: "none" }}>
              <span className="cond-label">標高</span>
              <span>
                {loadingConditions ? "取得中…" : elevation !== null ? `${elevation}m` : "不明"}
                {elevation !== null && <span className="basis">国土地理院</span>}
              </span>
            </div>
            <div className="cond-row">
              <span className="cond-label">気温（滞在中）</span>
              <span>
                {loadingConditions
                  ? "取得中…"
                  : weather?.available
                    ? `${weather.forecast.stay.temp_min ?? "?"}〜${weather.forecast.stay.temp_max ?? "?"}℃`
                    : "予定日を入れると表示"}
                {weather?.available && <span className="basis">天気予報</span>}
              </span>
            </div>
            <div className="hint">地形・地面は、診断のときに場所からAIが推定します</div>
          </div>
        )}

        <details className="more">
          <summary>詳しく入力（任意）: 移動手段・同行者・スタイル・地形・地面</summary>
          {prefs && (
            <div key={JSON.stringify(prefs)}>
              <div className="row">
                <Suggest
                  id="transport"
                  name="transport"
                  label="移動手段"
                  options={OPTIONS.transport}
                  defaultValue={prefs.transport}
                />
                <Suggest
                  id="companions"
                  name="companions"
                  label="同行者"
                  options={OPTIONS.companions}
                  defaultValue={prefs.companions}
                />
              </div>
              <div className="field">
                <label htmlFor="style">スタイル</label>
                <input
                  id="style"
                  name="style"
                  maxLength={100}
                  placeholder="例: まったり焚き火読書 / フリーサイト"
                  defaultValue={prefs.style}
                />
              </div>
              <div className="hint">移動手段・同行者・スタイルは前回の内容を覚えています</div>
            </div>
          )}
          <div className="row">
            <Suggest id="terrain" name="terrain" label="地形" options={OPTIONS.terrain} placeholder="空欄ならAIが推定" />
            <Suggest id="ground" name="ground" label="地面の性質" options={OPTIONS.ground} placeholder="空欄ならAIが推定" />
          </div>
        </details>

        <p className="hint">
          マイギア {gearCount}件・日記（直近{Math.min(diaryCount, 5)}件）を診断に反映します
        </p>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          🔍 診断する
        </button>
      </form>

      {!result && place && weather && <WeatherCard weather={weather} />}

      <div ref={resultRef}>{result && <DiagnosisView result={result} planId={planId} />}</div>
    </>
  );
}
