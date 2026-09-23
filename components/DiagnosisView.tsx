import { WeatherCard } from "@/components/WeatherCard";
import { riskLevelTone, riskVerdict, severityLabel } from "@/lib/diagnosis";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  RISK_BASIS_LABELS,
  type DiagnosisResult,
  type Priority,
  type Risk,
} from "@/lib/domain";

const PRIORITY_ORDER: Record<Priority, number> = { must: 0, recommended: 1, optional: 2 };

function RiskItems({ risks }: { risks: Risk[] }) {
  if (risks.length === 0) return <div className="empty">特になし</div>;
  return (
    <>
      {risks.map((r, i) => {
        const sev = severityLabel(r.severity);
        return (
          <div key={i} className={`risk-item tone-${sev.tone}`}>
            <span className="risk-dot" />
            <span className="risk-sev">
              {sev.label}({r.severity})
            </span>
            <span>
              {r.risk}
              {r.basis && <span className="basis">{RISK_BASIS_LABELS[r.basis]}</span>}
            </span>
          </div>
        );
      })}
    </>
  );
}

export function DiagnosisView({ result }: { result: DiagnosisResult }) {
  const verdict = riskVerdict(result.risk_level);
  const levelTone = riskLevelTone(result.risk_level);
  const gapCount = result.total_count - result.owned_count;

  return (
    <section>
      {result.location && (
        <div className="card">
          <h2>📍 診断した場所</h2>
          <b>{result.location.name}</b>
          <div className="muted">{result.location.address}</div>
          <div className="muted">
            標高 {result.location.elevation_m != null ? `${result.location.elevation_m}m（国土地理院）` : "不明"}
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${result.location.lat},${result.location.lon}`}
            target="_blank"
            rel="noreferrer"
          >
            🗺️ 地図で確認
          </a>
        </div>
      )}
      {result.weather && <WeatherCard weather={result.weather} title="🌦️ 診断に使った天気予報" />}

      <div className="card">
        <h2>📊 総合評価</h2>
        <div className={`verdict-banner tone-${verdict.tone}`}>
          <div className="verdict-title">{verdict.title}</div>
          <div className="verdict-text">{verdict.text}</div>
        </div>
        <div className="score-row">
          <div className={`score-box tone-${levelTone}`}>
            <div className="score-label">リスクレベル</div>
            <div className="score-value">
              {result.risk_level.toFixed(1)}
              <span className="score-unit">/5</span>
            </div>
            <div className="score-bar">
              <div className="score-fill" style={{ width: `${(result.risk_level / 5) * 100}%` }} />
            </div>
          </div>
          <div className="score-box tone-ok">
            <div className="score-label">準備度</div>
            <div className="score-value">
              {result.readiness_pct}
              <span className="score-unit">%</span>
            </div>
            <div className="score-bar">
              <div className="score-fill" style={{ width: `${result.readiness_pct}%` }} />
            </div>
          </div>
        </div>
        <div className="score-caption">
          リスクレベル:
          各リスクについて「対策を怠った場合に起こりうる影響の大きさ」を1(軽微)〜5(重大)でAIが評価し、平均したものです。目安:
          〜2未満=問題なし / 2〜3=軽度の注意 / 3〜4=要注意 / 4以上=警戒(中止も検討)。
          <br />
          準備度: パッキングリストの全アイテムのうち、所持している割合です。
        </div>
      </div>

      <div className="card">
        <h2>💬 総合アドバイス</h2>
        {result.diary_count_used > 0 && (
          <div className="score-caption" style={{ marginTop: 0, marginBottom: 8 }}>
            ⚡ 過去の日記{result.diary_count_used}件の傾向を踏まえた提案です
          </div>
        )}
        <div className="comment">
          {result.overall_advice || "アドバイスの生成に失敗しました。もう一度「診断する」を押してみてください。"}
        </div>
      </div>

      <div className="card">
        <h2>⚠️ 環境・気候リスク</h2>
        <RiskItems risks={result.environment_risks} />
      </div>

      <div className="card">
        <h2>🐾 生物・サイト特有のリスク</h2>
        <RiskItems risks={result.bio_site_risks} />
      </div>

      <div className="card">
        <h2>ℹ️ この注意情報の根拠</h2>
        <div className="score-caption" style={{ marginTop: 0 }}>
          各リスクの右のラベルが、判断のもとにしたデータです。
          <br />
          ・<b>天気予報</b>: 上の予報の数値（Open-Meteo）
          <br />
          ・<b>標高・地形</b>: 国土地理院の標高と、入力した地形・地面
          <br />
          ・<b>季節・地域の一般的傾向</b>: AIの一般知識による目安です。最新の出没情報や事故情報は含みません
          <br />
          ・<b>過去の日記</b>／<b>入力内容</b>: あなたの記録と今回の入力
          <br />
          警報・注意報は{" "}
          <a href="https://www.jma.go.jp/bosai/warning/" target="_blank" rel="noreferrer">
            気象庁
          </a>
          、クマの出没情報は都道府県・市町村の情報、キャンプ場の最新状況は公式サイトで必ず確認してください。
        </div>
      </div>

      <div className="card">
        <h2>🏷️ 推奨ギアタグ</h2>
        <div className="tags">
          {result.recommended_tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </div>
        {/* カバー件数と要準備件数は準備度と同じパッキングリストから数える */}
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          <span className="badge badge-owned" style={{ marginLeft: 0 }}>
            ✓ マイギアでカバー {result.owned_count}件
          </span>
          <span className="badge badge-need">要準備 {gapCount}件</span>
        </p>
      </div>

      <div className="card">
        <h2>🎒 パッキングリスト</h2>
        <div className="checklist">
          {CATEGORIES.map((cat) => {
            const items = result.packing_list
              .filter((p) => p.category === cat)
              .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <div className="checklist-cat">{CATEGORY_LABELS[cat]}</div>
                {items.map((p, i) => (
                  <label key={`${p.item}-${i}`}>
                    <input type="checkbox" />
                    <span className="item-name">{p.item}</span>
                    {p.is_base && <span className="badge badge-base">定番</span>}
                    <span className={`badge ${p.owned ? "badge-owned" : "badge-need"}`}>{p.owned ? "所持" : "要準備"}</span>
                    <span className={`badge badge-${p.priority}`}>{PRIORITY_LABELS[p.priority]}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
