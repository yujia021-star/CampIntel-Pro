"use client";

import { useState, useTransition } from "react";
import { saveExperienceReport } from "@/lib/actions/experience";
import {
  COLD_MAX_C,
  CONDITION_LABELS,
  CONDITIONS,
  INTERMEDIATE,
  LEVEL_LABELS,
  PRIOR_NIGHTS,
  PRIOR_NIGHTS_LABELS,
  TROPICAL_MIN_C,
  VETERAN,
  WINDOW_LABELS,
  type Condition,
  type Experience,
  type FeelTendency,
  type PriorNights,
  type SelfReport,
} from "@/lib/experience";

function ReportForm({ report, onDone }: { report: SelfReport | null; onDone: () => void }) {
  const [prior, setPrior] = useState<PriorNights>(report?.prior_nights ?? "0");
  const [conds, setConds] = useState<Condition[]>(report?.conditions ?? []);
  const [windows, setWindows] = useState<number[]>(report?.windows ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="exp-form">
      <label>① アプリを使う前に、泊まりのキャンプを何泊しましたか？</label>
      <div className="choice-row" role="group">
        {PRIOR_NIGHTS.map((p) => (
          <button key={p} type="button" className="choice-btn" aria-pressed={prior === p} onClick={() => setPrior(p)}>
            {PRIOR_NIGHTS_LABELS[p]}
          </button>
        ))}
      </div>
      <label>② 経験したことがあるもの（いくつでも）</label>
      <div className="chips">
        {CONDITIONS.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={conds.includes(c)} onClick={() => setConds(toggle(conds, c))}>
            {CONDITION_LABELS[c]}
          </button>
        ))}
      </div>
      <label>③ この1年で、泊まりで行った時期（いくつでも。日記に書いていない分）</label>
      <div className="chips">
        {WINDOW_LABELS.map((w, i) => (
          <button key={w} type="button" className="chip" aria-pressed={windows.includes(i)} onClick={() => setWindows(toggle(windows, i))}>
            {w}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await saveExperienceReport({ prior_nights: prior, conditions: conds, windows });
            if (r.ok) onDone();
            else setError(r.message ?? "保存できませんでした。");
          })
        }
      >
        {pending ? "保存中…" : "保存する"}
      </button>
      {error && <div className="error">{error}</div>}
      <p className="hint" style={{ marginBottom: 0 }}>
        ここで答えた経験に、日記の記録を足してレベルを判定します。③は時間がたつと古くなり、日記の記録に入れ替わっていきます。
      </p>
    </div>
  );
}

export function ExperienceCard({
  experience: e,
  tendency,
  report,
}: {
  experience: Experience;
  tendency: FeelTendency | null;
  report: SelfReport | null;
}) {
  const [editing, setEditing] = useState(false);
  const lv = LEVEL_LABELS[e.level];
  const showForm = editing || !report;

  return (
    <div className="card" id="experience">
      <h2>🧭 あなたのキャンプ経験</h2>
      <div className="exp-level">
        <span className="exp-icon">{lv.icon}</span>
        <div>
          <div className="exp-name">{lv.name}</div>
          {e.blank && <div className="hint" style={{ margin: 0 }}>経験は十分ですが、この1年で行っていない時期があります</div>}
        </div>
      </div>

      <div className="exp-axes">
        <div className="cond-row">
          <span className="cond-label">量（通算）</span>
          <span>
            {e.nights}泊 <span className="muted">/ ベテラン{VETERAN.nights}泊</span>
          </span>
        </div>
        <div className="cond-row">
          <span className="cond-label">幅（経験した条件）</span>
          <span className="exp-conds">
            {CONDITIONS.map((c) => (
              <span key={c} className={e.conditions.includes(c) ? "exp-on" : "exp-off"}>
                {e.conditions.includes(c) ? "✓" : "・"}
                {CONDITION_LABELS[c].replace(/（.*）/, "")}
              </span>
            ))}
          </span>
        </div>
        <div className="cond-row">
          <span className="cond-label">鮮度（直近1年）</span>
          <span className="exp-windows" aria-label={`直近1年の4区間のうち${e.windows.filter(Boolean).length}区間`}>
            {[...e.windows].reverse().map((on, i) => (
              <span key={i} className={on ? "exp-box on" : "exp-box"} title={WINDOW_LABELS[3 - i]} />
            ))}
            <span className="muted" style={{ fontSize: "0.75rem" }}>
              {e.windows.filter(Boolean).length}/4
            </span>
          </span>
        </div>
      </div>
      <div className="hint" style={{ textAlign: "right", marginTop: 0 }}>鮮度の四角は、左が9〜12か月前・右が直近3か月</div>

      {e.next.length > 0 && (
        <div className="exp-next">
          <b>{e.level === "intermediate" || e.blank ? "ベテラン" : e.level === "beginner" ? "中級" : "ビギナー"}まで:</b>{" "}
          {e.next.join("、")}
        </div>
      )}

      <details className="more">
        <summary>レベルの決め方</summary>
        <div className="score-caption">
          ベテラン＝条件が変わっても自分で準備と判断ができる人、と考えて3つの軸で見ています。
          <br />・量: 通算の泊数（デイキャンプは数えない）
          <br />・幅: 雨／寒い夜（最低{COLD_MAX_C}℃以下）／熱帯夜（夜の最低{TROPICAL_MIN_C}℃以上）／連泊 のうち経験した数
          <br />・鮮度: 直近1年を3か月ずつ4つに分け、泊まりで行った区間の数
          <br />🔥 ベテラン: {VETERAN.nights}泊以上・幅{VETERAN.conditions}つ以上・鮮度4/4
          <br />🏕️ 中級: {INTERMEDIATE.nights}泊以上・幅{INTERMEDIATE.conditions}つ以上
          <br />🔰 ビギナー: 1泊以上　🌱 はじめて: 0泊
          <br />
          寒い夜・熱帯夜は、診断からの日記なら予報の最低気温で、そうでなければ体感（寒すぎ・暑すぎ）で数えます。レベルに合わせて、診断のアドバイスの詳しさが変わります。
        </div>
      </details>

      {tendency && (
        <div className="exp-tendency">
          🌡️ <b>体感のクセ: {tendency.summary}</b>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            {tendency.detail}。診断ではこのクセを踏まえて防寒・暑さ対策を提案します。
          </div>
        </div>
      )}

      {showForm ? (
        <>
          {!report && <p className="muted" style={{ marginBottom: 0 }}>まず、アプリを使う前の経験を教えてください（1回だけ）。</p>}
          <ReportForm report={report} onDone={() => setEditing(false)} />
        </>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => setEditing(true)}>
          これまでの経験（自己申告）を直す
        </button>
      )}
    </div>
  );
}
