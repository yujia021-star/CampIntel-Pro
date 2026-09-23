"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createDiaryEntry, deleteDiaryEntry } from "@/lib/actions/diary";
import { computeBadges, newlyEarnedBadge } from "@/lib/badges";
import {
  BUGS,
  NIGHTS_ICONS,
  NIGHTS_LABELS,
  NIGHTS_OPTIONS,
  TEMP_FEELS,
  WEATHERS,
  type Bugs,
  type DiaryEntry,
  type TempFeel,
  type Weather,
} from "@/lib/domain";

/** 日記の表示・入力に使う、もとになった診断の要点 */
export interface PlanSummary {
  id: string;
  campsite: string;
  planned_date: string | null;
  nights: number | null;
  /** 診断のときの予報（滞在中の集計）。予報がなかった診断は null */
  forecast: { temp_min: number | null; temp_max: number | null; precip_prob_max: number | null } | null;
}

function forecastText(f: NonNullable<PlanSummary["forecast"]>): string {
  return `最低${f.temp_min ?? "?"}℃〜最高${f.temp_max ?? "?"}℃・降水確率${f.precip_prob_max ?? "?"}%`;
}

const WEATHER_ICON: Record<Weather, string> = { 晴れ: "☀️", 曇り: "☁️", 雨: "🌧️" };
const TEMP_ICON: Record<TempFeel, string> = { 寒すぎ: "🥶", ちょうどいい: "😊", 暑すぎ: "🥵" };
const BUGS_ICON: Record<Bugs, string> = { なし: "🚫", 少し: "🦟", 多い: "🐝" };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ChoiceRow<T extends string>({
  label,
  options,
  icons,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  icons: Record<T, string>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <>
      <label>{label}</label>
      <div className="choice-row" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" className="choice-btn" aria-pressed={value === o} onClick={() => onChange(o)}>
            {icons[o]} {o}
          </button>
        ))}
      </div>
    </>
  );
}

function GearChips({ names, selected, onToggle, bad }: { names: string[]; selected: string[]; onToggle: (n: string) => void; bad?: boolean }) {
  if (names.length === 0) return <div className="empty" style={{ padding: "2px 0", textAlign: "left" }}>マイギアが未登録です</div>;
  return (
    <div className="chips">
      {names.map((n) => (
        <button key={n} type="button" className={`chip${bad ? " chip-bad" : ""}`} aria-pressed={selected.includes(n)} onClick={() => onToggle(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

export function DiaryManager({
  entries,
  gearNames,
  plans = {},
  fromPlan = null,
}: {
  entries: DiaryEntry[];
  gearNames: string[];
  plans?: Record<string, PlanSummary>;
  /** 「この計画の日記を書く」から来たときの診断 */
  fromPlan?: PlanSummary | null;
}) {
  const router = useRouter();
  const badges = useMemo(() => computeBadges(entries), [entries]);

  const [date, setDate] = useState(() => fromPlan?.planned_date ?? today());
  const [campsite, setCampsite] = useState(fromPlan?.campsite ?? "");
  const [nights, setNights] = useState<number>(fromPlan?.nights ?? 1);
  const [linkedPlan, setLinkedPlan] = useState<PlanSummary | null>(fromPlan);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [tempFeel, setTempFeel] = useState<TempFeel | null>(null);
  const [bugs, setBugs] = useState<Bugs | null>(null);
  const [sleep, setSleep] = useState(0);
  const [good, setGood] = useState<string[]>([]);
  const [bad, setBad] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 良かった/合わなかった は排他（同じギアを両方に入れない）
  function toggle(name: string, list: "good" | "bad") {
    const [mine, setMine, setOther] = list === "good" ? [good, setGood, setBad] : [bad, setBad, setGood];
    if (mine.includes(name)) setMine(mine.filter((n) => n !== name));
    else {
      setMine([...mine, name]);
      setOther((o) => o.filter((n) => n !== name));
    }
  }

  function save() {
    // デイキャンプは泊まらないので眠りの質は聞かない（DBは必須なので中間の3で保存し、AIには渡さない）
    const sleepQuality = nights === 0 ? 3 : sleep;
    if (!weather || !tempFeel || !bugs || !sleepQuality) {
      setError(
        nights === 0
          ? "天候・体感温度・虫の多さをタップで選んでください"
          : "天候・体感温度・虫の多さ・眠りの質をタップで選んでください",
      );
      return;
    }
    setError(null);
    const input = {
      date,
      campsite,
      weather,
      temp_feel: tempFeel,
      bugs,
      sleep_quality: sleepQuality,
      good_gear: good,
      bad_gear: bad,
      note,
      nights,
      plan_id: linkedPlan?.id ?? null,
    };
    startTransition(async () => {
      const r = await createDiaryEntry(input);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      const newBadge = newlyEarnedBadge(entries, [input, ...entries]);
      setBanner(
        newBadge
          ? `🎉 新しいバッジ「${newBadge.icon} ${newBadge.name}」を獲得しました！`
          : `🔥 通算${entries.length + 1}回目の記録、お疲れさまでした`,
      );
      setCampsite("");
      setLinkedPlan(null);
      // 計画から来たときの ?plan= を消して、次は普通の記録にする
      if (fromPlan) router.replace("/diary");
      setNote("");
      setWeather(null);
      setTempFeel(null);
      setBugs(null);
      setSleep(0);
      setGood([]);
      setBad([]);
    });
  }

  return (
    <>
      <div className="card">
        <h2>🏆 達成バッジ</h2>
        <div className="badge-grid">
          {badges.map((b) => (
            <div key={b.id} className={`badge-item${b.earned ? " earned" : ""}`} title={b.description}>
              <div className="badge-icon">{b.icon}</div>
              <div className="badge-title">{b.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>📔 今日の記録</h2>
        {linkedPlan && (
          <div className="place-selected" style={{ marginTop: 0, marginBottom: 8 }}>
            📋 「{linkedPlan.campsite}」の診断から記録します
            {linkedPlan.forecast && (
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                診断のときの予報: {forecastText(linkedPlan.forecast)}
              </div>
            )}
            <div className="hint">予報と実際の体感の差を、次の診断で活かします。</div>
            <button type="button" className="btn btn-danger btn-sm" style={{ paddingLeft: 0 }} onClick={() => setLinkedPlan(null)}>
              ひも付けを外す
            </button>
          </div>
        )}
        <label htmlFor="d-site" style={{ marginTop: 0 }}>
          キャンプ場名（任意）
        </label>
        <input id="d-site" value={campsite} maxLength={100} placeholder="例: WOODSMAN CAMPGROUND" onChange={(e) => setCampsite(e.target.value)} />
        <label>滞在</label>
        <div className="choice-row" role="group" aria-label="滞在">
          {NIGHTS_OPTIONS.map((n) => (
            <button key={n} type="button" className="choice-btn" aria-pressed={nights === n} onClick={() => setNights(n)}>
              {NIGHTS_ICONS[n]} {NIGHTS_LABELS[n]}
            </button>
          ))}
        </div>
        <label htmlFor="d-date">{nights === 0 ? "日付" : "初日"}</label>
        <input id="d-date" type="date" value={date} required onChange={(e) => setDate(e.target.value)} />

        <ChoiceRow label="天候" options={WEATHERS} icons={WEATHER_ICON} value={weather} onChange={setWeather} />
        <ChoiceRow label="体感温度" options={TEMP_FEELS} icons={TEMP_ICON} value={tempFeel} onChange={setTempFeel} />
        <ChoiceRow label="虫の多さ" options={BUGS} icons={BUGS_ICON} value={bugs} onChange={setBugs} />

{nights > 0 && (
          <>
        <label>眠りの質</label>
        <div className="star-row" role="group" aria-label="眠りの質">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={`star${n <= sleep ? " active" : ""}`} aria-label={`${n}`} onClick={() => setSleep(n)}>
              ★
            </button>
          ))}
        </div>
          </>
        )}

        <label>良かったギア（タップで選択）</label>
        <GearChips names={gearNames} selected={good} onToggle={(n) => toggle(n, "good")} />
        <label>不要だった／合わなかったギア</label>
        <GearChips names={gearNames} selected={bad} onToggle={(n) => toggle(n, "bad")} bad />

        <label htmlFor="d-note">一言メモ（任意）</label>
        <input id="d-note" value={note} maxLength={500} placeholder="例: 明け方が特に冷えた" onChange={(e) => setNote(e.target.value)} />

        <button className="btn btn-primary" type="button" disabled={pending} onClick={save}>
          {pending ? "保存中…" : "📔 記録する"}
        </button>
        {error && <div className="error">{error}</div>}
      </div>

      {(banner || entries.length > 0) && (
        <div className="card">
          {banner && <div className="streak-banner">{banner}</div>}
          <h2>📖 記録一覧（通算{entries.length}回）</h2>
          {entries.map((e) => (
            <div key={e.id} className="diary-entry">
              <div style={{ minWidth: 0 }}>
                <div className="diary-meta">
                  {e.date}
                  {e.nights != null ? ` ・ ${NIGHTS_ICONS[e.nights]} ${NIGHTS_LABELS[e.nights]}` : ""}
                  {e.campsite ? ` ・ ${e.campsite}` : ""}
                </div>
                <div className="diary-tags">
                  {WEATHER_ICON[e.weather]} {e.weather}　{TEMP_ICON[e.temp_feel]} {e.temp_feel}　🦟 {e.bugs}
                  {e.nights !== 0 && `${"★".repeat(e.sleep_quality)}${"☆".repeat(5 - e.sleep_quality)}`}
                </div>
                {e.good_gear.length > 0 && <div className="diary-tags">👍 {e.good_gear.join("、")}</div>}
                {e.bad_gear.length > 0 && <div className="diary-tags">👎 {e.bad_gear.join("、")}</div>}
                {e.note && <div className="diary-note">{e.note}</div>}
                {e.plan_id && plans[e.plan_id] && (
                  <div className="diary-tags muted" style={{ fontSize: "0.8rem" }}>
                    {plans[e.plan_id].forecast
                      ? `🌡️ 予報 ${forecastText(plans[e.plan_id].forecast!)} → 体感: ${e.temp_feel}　`
                      : ""}
                    <Link href={`/history/${e.plan_id}`}>診断を見る</Link>
                  </div>
                )}
              </div>
              <button
                className="btn btn-danger btn-sm"
                aria-label="削除"
                disabled={pending}
                onClick={() => {
                  if (!confirm("この日記を削除しますか？")) return;
                  startTransition(async () => void (await deleteDiaryEntry(e.id)));
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
