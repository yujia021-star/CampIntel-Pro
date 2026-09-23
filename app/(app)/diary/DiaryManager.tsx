"use client";

import { useMemo, useState, useTransition } from "react";
import { createDiaryEntry, deleteDiaryEntry } from "@/lib/actions/diary";
import { computeBadges, newlyEarnedBadge } from "@/lib/badges";
import { BUGS, TEMP_FEELS, WEATHERS, type Bugs, type DiaryEntry, type TempFeel, type Weather } from "@/lib/domain";

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

export function DiaryManager({ entries, gearNames }: { entries: DiaryEntry[]; gearNames: string[] }) {
  const badges = useMemo(() => computeBadges(entries), [entries]);

  const [date, setDate] = useState(today);
  const [campsite, setCampsite] = useState("");
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
    if (!weather || !tempFeel || !bugs || !sleep) {
      setError("天候・体感温度・虫の多さ・眠りの質をタップで選んでください");
      return;
    }
    setError(null);
    const input = {
      date,
      campsite,
      weather,
      temp_feel: tempFeel,
      bugs,
      sleep_quality: sleep,
      good_gear: good,
      bad_gear: bad,
      note,
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
        <label htmlFor="d-site" style={{ marginTop: 0 }}>
          キャンプ場名（任意）
        </label>
        <input id="d-site" value={campsite} maxLength={100} placeholder="例: WOODSMAN CAMPGROUND" onChange={(e) => setCampsite(e.target.value)} />
        <label htmlFor="d-date">日付</label>
        <input id="d-date" type="date" value={date} required onChange={(e) => setDate(e.target.value)} />

        <ChoiceRow label="天候" options={WEATHERS} icons={WEATHER_ICON} value={weather} onChange={setWeather} />
        <ChoiceRow label="体感温度" options={TEMP_FEELS} icons={TEMP_ICON} value={tempFeel} onChange={setTempFeel} />
        <ChoiceRow label="虫の多さ" options={BUGS} icons={BUGS_ICON} value={bugs} onChange={setBugs} />

        <label>眠りの質</label>
        <div className="star-row" role="group" aria-label="眠りの質">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={`star${n <= sleep ? " active" : ""}`} aria-label={`${n}`} onClick={() => setSleep(n)}>
              ★
            </button>
          ))}
        </div>

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
                  {e.campsite ? ` ・ ${e.campsite}` : ""}
                </div>
                <div className="diary-tags">
                  {WEATHER_ICON[e.weather]} {e.weather}　{TEMP_ICON[e.temp_feel]} {e.temp_feel}　🦟 {e.bugs}
                  {"★".repeat(e.sleep_quality)}
                  {"☆".repeat(5 - e.sleep_quality)}
                </div>
                {e.good_gear.length > 0 && <div className="diary-tags">👍 {e.good_gear.join("、")}</div>}
                {e.bad_gear.length > 0 && <div className="diary-tags">👎 {e.bad_gear.join("、")}</div>}
                {e.note && <div className="diary-note">{e.note}</div>}
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
