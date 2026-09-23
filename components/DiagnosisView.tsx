import { riskVerdict } from "@/lib/diagnosis";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  type DiagnosisResult,
  type PackingItem,
  type Priority,
  type Risk,
} from "@/lib/domain";

const PRIORITY_ORDER: Record<Priority, number> = { must: 0, recommended: 1, optional: 2 };

function RiskList({ risks }: { risks: Risk[] }) {
  if (risks.length === 0) return <p className="muted">特筆すべきリスクはありません。</p>;
  return (
    <>
      {[...risks]
        .sort((a, b) => b.severity - a.severity)
        .map((r, i) => (
          <div key={i} className={`risk sev-${r.severity}`}>
            <div className="risk-head">
              <span>{r.title}</span>
              <span aria-label={`深刻度 ${r.severity}/5`}>{"●".repeat(r.severity) + "○".repeat(5 - r.severity)}</span>
            </div>
            <p>{r.detail}</p>
          </div>
        ))}
    </>
  );
}

function PackingRow({ p }: { p: PackingItem }) {
  return (
    <div className="pack-item">
      <span aria-hidden>{p.owned ? "✅" : "⬜"}</span>
      <div style={{ minWidth: 0 }}>
        <div>{p.item}</div>
        {p.reason && <div className="reason">{p.reason}</div>}
      </div>
      <div className="pack-badges">
        {p.is_base && <span className="badge badge-base">定番</span>}
        <span className={`badge ${p.owned ? "badge-owned" : "badge-need"}`}>{p.owned ? "所持" : "要準備"}</span>
        <span className={`badge badge-${p.priority}`}>{PRIORITY_LABELS[p.priority]}</span>
      </div>
    </div>
  );
}

export function DiagnosisView({ result, title }: { result: DiagnosisResult; title?: string }) {
  const verdict = riskVerdict(result.risk_level);
  const owned = result.packing_list.filter((p) => p.owned);

  return (
    <section>
      {title && <h2>{title}</h2>}

      <div className="scores">
        <div className="score">
          <div className="score-label">リスクレベル</div>
          <div className={`score-num tone-${verdict.tone}`} style={{ background: "none", border: "none" }}>
            {result.risk_level.toFixed(1)}
          </div>
          <div className="score-label">/ 5.0</div>
        </div>
        <div className="score">
          <div className="score-label">準備度</div>
          <div className="score-num">{result.readiness_pct}%</div>
          <div className="meter">
            <div style={{ width: `${result.readiness_pct}%` }} />
          </div>
          <div className="score-label" style={{ marginTop: 6 }}>
            {result.total_count}件中 {result.owned_count}件をマイギアでカバー
          </div>
        </div>
      </div>

      <div className={`verdict tone-${verdict.tone}`}>判定: {verdict.label}</div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>🌄 環境・気候リスク</h3>
        <RiskList risks={result.environment_risks} />
        <h3>🐻 生物・サイトリスク</h3>
        <RiskList risks={result.bio_site_risks} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>🏷️ 推奨ギアタグ</h3>
        <div>
          {result.recommended_tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </div>
        <h3>🎒 所持ギアとのマッチング</h3>
        {owned.length === 0 ? (
          <p className="muted">マイギアに該当するものがありません。マイギアを登録すると精度が上がります。</p>
        ) : (
          <div className="chips">
            {owned.map((p) => (
              <span key={p.gear_id ?? p.item} className="tag">
                {p.item}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>📋 パッキングリスト</h3>
        {CATEGORIES.map((cat) => {
          const items = result.packing_list
            .filter((p) => p.category === cat)
            .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
          if (items.length === 0) return null;
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", marginTop: 8 }}>{CATEGORY_LABELS[cat]}</div>
              {items.map((p, i) => (
                <PackingRow key={`${p.item}-${i}`} p={p} />
              ))}
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>💡 総合アドバイス</h3>
        {result.diary_count_used > 0 && (
          <p className="muted" style={{ marginTop: 0 }}>
            📓 過去の日記{result.diary_count_used}件を踏まえた提案です
          </p>
        )}
        <div className="advice">{result.overall_advice}</div>
      </div>
    </section>
  );
}
