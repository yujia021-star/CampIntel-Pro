"use client";

import { useMemo, useState, useTransition } from "react";
import { createDiaryEntry, deleteDiaryEntry } from "@/lib/actions/diary";
import { computeBadges } from "@/lib/badges";
import { BUGS, TEMP_FEELS, WEATHERS, type Bugs, type DiaryEntry, type TempFeel, type Weather } from "@/lib/domain";

const WEATHER_ICON: Record<Weather, string> = { 晴れ: "☀️", 曇り: "☁️", 雨: "☔" };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ChipGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  render?: (v: T) => string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="chips" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" className="chip" aria-pressed={value === o} onClick={() => onChange(o)}>
            {render ? render(o) : o}
          </button>
        ))}
      </div>
    </div>
  );
}

function DiaryForm({ gearNames }: { gearNames: string[] }) {
  const [date, setDate] = useState(today);
  const [campsite, setCampsite] = useState("");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [tempFeel, setTempFeel] = useState<TempFeel | null>(null);
  const [bugs, setBugs] = useState<Bugs | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [good, setGood] = useState<string[]>([]);
  const [bad, setBad] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!weather || !tempFeel || !bugs || !sleep) {
      setMessage({ ok: false, text: "天候・体感温度・虫・眠りの質をタップで選んでください" });
      return;
    }
    startTransition(async () => {
      const r = await createDiaryEntry({
        date,
        campsite,
        weather,
        temp_feel: tempFeel,
        bugs,
        sleep_quality: sleep,
        good_gear: good,
        bad_gear: bad,
        note,
      });
      if (!r.ok) {
        setMessage({ ok: false, text: r.message });
        return;
      }
      setMessage({ ok: true, text: "記録しました！次回の診断に反映されます" });
      setCampsite("");
      setWeather(null);
      setTempFeel(null);
      setBugs(null);
      setSleep(null);
      setGood([]);
      setBad([]);
      setNote("");
    });
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>📓 日記を記録</h2>
      <div className="row">
        <div className="field">
          <label htmlFor="d-date">日付</label>
          <input id="d-date" type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="d-site">キャンプ場（任意）</label>
          <input id="d-site" value={campsite} maxLength={100} onChange={(e) => setCampsite(e.target.value)} />
        </div>
      </div>
      <ChipGroup label="天候" options={WEATHERS} value={weather} onChange={setWeather} render={(w) => `${WEATHER_ICON[w]} ${w}`} />
      <ChipGroup label="体感温度" options={TEMP_FEELS} value={tempFeel} onChange={setTempFeel} />
      <ChipGroup label="虫の多さ" options={BUGS} value={bugs} onChange={setBugs} />
      <ChipGroup label="眠りの質" options={[1, 2, 3, 4, 5] as const} value={sleep} onChange={setSleep} render={(n) => `${n}`} />

      {gearNames.length > 0 && (
        <>
          <div className="field">
            <label>👍 良かったギア</label>
            <div className="chips">
              {gearNames.map((n) => (
                <button key={n} type="button" className="chip" aria-pressed={good.includes(n)} onClick={() => toggle(n, "good")}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>👎 合わなかったギア</label>
            <div className="chips">
              {gearNames.map((n) => (
                <button key={n} type="button" className="chip chip-bad" aria-pressed={bad.includes(n)} onClick={() => toggle(n, "bad")}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="d-note">ひとことメモ（任意）</label>
        <textarea id="d-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </div>
      {message && <p className={message.ok ? "success" : "error"}>{message.text}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "保存中…" : "記録する"}
      </button>
    </form>
  );
}

export function DiaryManager({ entries, gearNames }: { entries: DiaryEntry[]; gearNames: string[] }) {
  const badges = useMemo(() => computeBadges(entries), [entries]);
  const earned = badges.filter((b) => b.earned).length;
  const [pending, startTransition] = useTransition();

  return (
    <>
      <DiaryForm gearNames={gearNames} />

      <div className="card">
        <h2>
          🏅 バッジ {earned}/{badges.length}
        </h2>
        <div className="badges-grid">
          {badges.map((b) => (
            <div key={b.id} className={`badge-card ${b.earned ? "" : "locked"}`} title={b.description}>
              <div className="icon">{b.icon}</div>
              <div className="name">{b.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ opacity: pending ? 0.6 : 1 }}>
        <h2>これまでの日記（{entries.length}件）</h2>
        {entries.length === 0 && <p className="muted">まだ記録がありません。</p>}
        {entries.map((e) => (
          <div key={e.id} className="list-item">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>
                {e.date} {e.campsite ?? ""}
              </div>
              <div className="muted">
                {WEATHER_ICON[e.weather]} {e.weather}・{e.temp_feel}・虫{e.bugs}・眠り{"★".repeat(e.sleep_quality)}
              </div>
              {e.good_gear.length > 0 && <div className="muted">👍 {e.good_gear.join("、")}</div>}
              {e.bad_gear.length > 0 && <div className="muted">👎 {e.bad_gear.join("、")}</div>}
              {e.note && <div style={{ fontSize: "0.85rem", marginTop: 4 }}>{e.note}</div>}
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (!confirm("この日記を削除しますか？")) return;
                startTransition(async () => void (await deleteDiaryEntry(e.id)));
              }}
            >
              削除
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
