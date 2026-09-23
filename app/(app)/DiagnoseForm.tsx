"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DiagnosisView } from "@/components/DiagnosisView";
import { LoadingOverlay } from "@/components/Loading";
import { WeatherCard } from "@/components/WeatherCard";
import { NIGHTS_ICONS, NIGHTS_LABELS, NIGHTS_OPTIONS, type DiagnosisResult } from "@/lib/domain";
import type { Place } from "@/lib/geo/places";
import { addDays, type ForecastResult } from "@/lib/weather/forecast";
import { dayLabel } from "@/components/WeatherCard";

// 地形・地面は場所から AI が推定するので入力にしない
const TRANSPORTS = ["車", "徒歩・公共交通機関"] as const;
const TRANSPORT_ICONS: Record<(typeof TRANSPORTS)[number], string> = { 車: "🚗", "徒歩・公共交通機関": "🚶" };
const COMPANIONS = ["子どもあり", "子どもなし"] as const;
const COMPANION_ICONS: Record<(typeof COMPANIONS)[number], string> = { 子どもあり: "👨‍👩‍👧", 子どもなし: "🧑" };

/** 以前の自由入力の値を、今の選択肢に読み替える（読み替えられなければ未選択） */
function asChoice<T extends string>(value: string | undefined, choices: readonly T[], legacy: Record<string, T> = {}): T | "" {
  if (!value) return "";
  if ((choices as readonly string[]).includes(value)) return value as T;
  return legacy[value] ?? "";
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

export function DiagnoseForm({
  gearCount,
  diaryCount,
  initialPlace = null,
  initialDate = null,
  level = null,
}: {
  gearCount: number;
  diaryCount: number;
  /** 天気の画面から来たときの場所と日付 */
  initialPlace?: Place | null;
  initialDate?: string | null;
  /** 経験レベル（アドバイスの詳しさが変わる） */
  level?: { label: string; reported: boolean } | null;
}) {
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [resultCompanions, setResultCompanions] = useState<string | null>(null);
  const [resultTransport, setResultTransport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // 場所の検索
  const [campsite, setCampsite] = useState(initialPlace?.name ?? "");
  const [candidates, setCandidates] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [place, setPlace] = useState<Place | null>(initialPlace);

  // 標高・気温は場所と予定日から自動で取得して表示する（入力欄にはしない）
  const [date, setDate] = useState(() => initialDate ?? nextSaturday());
  // 泊数（0 = デイキャンプ）
  const [nights, setNights] = useState(1);
  const [elevation, setElevation] = useState<number | null>(null);
  const [weather, setWeather] = useState<ForecastResult | null>(null);
  const [loadingConditions, setLoadingConditions] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [transport, setTransport] = useState<string>("");
  const [companions, setCompanions] = useState<string>("");

  useEffect(() => {
    // localStorage はブラウザでしか読めないので、表示後に読み込む
    const loaded = loadPrefs();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(loaded);
    setTransport(asChoice(loaded.transport, TRANSPORTS, { 公共交通機関: "徒歩・公共交通機関", 徒歩: "徒歩・公共交通機関" }));
    setCompanions(asChoice(loaded.companions, COMPANIONS));
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
      setResultCompanions(body.companions || null);
      setResultTransport(body.transport || null);
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

        {/* 移動手段と同行者は、診断（リスク・持ち物）と周辺施設の出し分けに効くので、畳まずにタップで選ぶ */}
        <div className="field">
          <label>移動手段</label>
          <div className="choice-row" role="group" aria-label="移動手段">
            {TRANSPORTS.map((t) => (
              <button key={t} type="button" className="choice-btn" aria-pressed={transport === t} onClick={() => setTransport(transport === t ? "" : t)}>
                {TRANSPORT_ICONS[t]} {t}
              </button>
            ))}
          </div>
          <input type="hidden" name="transport" value={transport} />
        </div>
        <div className="field">
          <label>同行者</label>
          <div className="choice-row" role="group" aria-label="同行者">
            {COMPANIONS.map((c) => (
              <button key={c} type="button" className="choice-btn" aria-pressed={companions === c} onClick={() => setCompanions(companions === c ? "" : c)}>
                {COMPANION_ICONS[c]} {c}
              </button>
            ))}
          </div>
          <input type="hidden" name="companions" value={companions} />
          <div className="hint">移動手段・同行者は前回の選択を覚えています</div>
        </div>
        <details className="more">
          <summary>スタイル（任意）</summary>
          {prefs && (
            <div className="field" key={JSON.stringify(prefs)}>
              <input
                id="style"
                name="style"
                maxLength={100}
                aria-label="スタイル"
                placeholder="例: まったり焚き火読書 / フリーサイト"
                defaultValue={prefs.style}
              />
            </div>
          )}
        </details>

        <p className="hint">
          マイギア {gearCount}件・日記（直近{Math.min(diaryCount, 5)}件）を診断に反映します
          {level && (
            <>
              <br />
              経験レベル「{level.label}」に合わせてアドバイスします
              {!level.reported && (
                <>
                  （<Link href="/diary#experience">これまでの経験を教える</Link>）
                </>
              )}
            </>
          )}
        </p>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          🔍 診断する
        </button>
      </form>

      {!result && place && weather && <WeatherCard weather={weather} />}

      <div ref={resultRef}>{result && <DiagnosisView result={result} planId={planId} campsite={campsite} companions={resultCompanions} transport={resultTransport} />}</div>
    </>
  );
}
