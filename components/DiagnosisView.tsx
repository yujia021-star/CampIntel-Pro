import Link from "next/link";
import { NearbyCard } from "@/components/NearbyCard";
import { ShareButton } from "@/components/ShareButton";
import { dayLabel, WeatherCard } from "@/components/WeatherCard";
import { countBySeverity, riskVerdict, severityLabel } from "@/lib/diagnosis";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  NIGHTS_ICONS,
  NIGHTS_LABELS,
  PRIORITY_LABELS,
  RISK_BASIS_LABELS,
  type DiagnosisResult,
  type Priority,
  type Risk,
  type SiteConditions,
} from "@/lib/domain";
import { hasAffiliate, reserveLinks, shopLinks } from "@/lib/links";

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

const SOURCE_LABELS: Record<string, string> = {
  gsi: "国土地理院",
  forecast: "天気予報",
  input: "入力",
  ai: "AIの推定",
};

function ConditionRow({ label, value, source }: { label: string; value: string | null; source: string | null }) {
  return (
    <div className="cond-row">
      <span className="cond-label">{label}</span>
      <span>
        {value ?? "不明"}
        {value && source && <span className="basis">{SOURCE_LABELS[source]}</span>}
      </span>
    </div>
  );
}

function stayText(stay: NonNullable<DiagnosisResult["stay"]>): string {
  const label = `${NIGHTS_ICONS[stay.nights] ?? ""} ${NIGHTS_LABELS[stay.nights] ?? ""}`.trim();
  if (!stay.start) return label;
  if (stay.nights === 0 || !stay.end) return `${label}（${dayLabel(stay.start)}）`;
  return `${label}（${dayLabel(stay.start)}〜${dayLabel(stay.end)}）`;
}

function PlaceCard({ result }: { result: DiagnosisResult }) {
  const loc = result.location;
  const c: SiteConditions | null | undefined = result.conditions;
  if (!loc && !c && !result.stay) return null;
  const temp =
    c && (c.temp_min !== null || c.temp_max !== null) ? `${c.temp_min ?? "?"}〜${c.temp_max ?? "?"}℃` : null;
  return (
    <div className="card">
      <h2>📍 診断した場所と条件</h2>
      {loc && (
        <div style={{ marginBottom: 8 }}>
          <b>{loc.name}</b>
          <div className="muted">{loc.address}</div>
          {loc.auto && (
            <div className="hint" style={{ color: "var(--amber)" }}>
              場所を選ばずに診断したため、名前から自動で選んだ場所です。違う場合は「場所を検索」で候補から選び直してください。
            </div>
          )}
          <a href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lon}`} target="_blank" rel="noreferrer">
            🗺️ 地図で確認
          </a>
        </div>
      )}
      {result.stay && <ConditionRow label="滞在" value={stayText(result.stay)} source={null} />}
      {c ? (
        <>
          <ConditionRow
            label="標高"
            value={c.elevation_m !== null ? `${c.elevation_m}m` : null}
            source={c.elevation_source}
          />
          <ConditionRow label="気温（滞在中）" value={temp} source={c.temp_source} />
          <ConditionRow label="地形" value={c.terrain} source={c.terrain_source} />
          <ConditionRow label="地面" value={c.ground} source={c.ground_source} />
        </>
      ) : (
        loc && (
          <div className="muted">
            標高 {loc.elevation_m != null ? `${loc.elevation_m}m（国土地理院）` : "不明"}
          </div>
        )
      )}
    </div>
  );
}

export function DiagnosisView({
  result,
  planId,
  campsite,
  companions,
  shared = false,
}: {
  result: DiagnosisResult;
  planId?: string | null;
  /** 入力したキャンプ場名（予約リンクに使う） */
  campsite?: string | null;
  companions?: string | null;
  /** ログインしていない人向けの共有ページで表示するか */
  shared?: boolean;
}) {
  const siteName = campsite?.trim() || result.location?.name || "";
  const affiliate = hasAffiliate();
  const verdict = riskVerdict(result.risk_level);
  const counts = countBySeverity([...result.environment_risks, ...result.bio_site_risks]);
  const gapCount = result.total_count - result.owned_count;

  return (
    <section>
      <PlaceCard result={result} />
      {result.weather && <WeatherCard weather={result.weather} title="🌦️ 診断に使った天気予報" />}
      {result.location && (
        <NearbyCard location={result.location} companions={companions} fetchNames={!shared} />
      )}

      <div className="card">
        <h2>📊 総合評価</h2>
        <div className={`verdict-banner tone-${verdict.tone}`}>
          <div className="verdict-title">{verdict.title}</div>
          <div className="verdict-text">{verdict.text}</div>
        </div>
        <div className="score-row">
          <div className={`score-box tone-${verdict.tone}`}>
            <div className="score-label">リスクレベル</div>
            <div className="score-value">
              {Number.isInteger(result.risk_level) ? result.risk_level : result.risk_level.toFixed(1)}
              <span className="score-unit">/5</span>
            </div>
            <div className="score-bar">
              <div className="score-fill" style={{ width: `${(result.risk_level / 5) * 100}%` }} />
            </div>
            <div className="score-label" style={{ marginTop: 6 }}>
              高 {counts.high}・注意 {counts.mid}・軽微 {counts.low}
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
          リスクレベル: 各リスクの危険度（起こりやすさ×影響の大きさ、1〜5）のうち、いちばん高いものです。目安: 1=問題なし /
          2=軽度の注意 / 3=要注意 / 4=警戒 / 5=危険（中止も検討）。
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
        <h2>
          🎒 パッキングリスト {affiliate && gapCount > 0 && <span className="pr-label">PR</span>}
        </h2>
        {gapCount > 0 && (
          <p className="hint" style={{ marginTop: 0 }}>
            「要準備」のものは、Amazon・楽天で探せます{affiliate ? "（リンクには広告（アフィリエイト）を含みます）" : ""}。
          </p>
        )}
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
                    {!p.owned && (
                      <span className="shop-links">
                        {shopLinks(p.item).map((l) => (
                          <a key={l.label} href={l.url} target="_blank" rel="noreferrer sponsored">
                            {l.label}
                          </a>
                        ))}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {siteName && (
        <div className="card">
          <h2>🏕️ 予約・空き状況</h2>
          <div className="link-row">
            {reserveLinks(siteName).map((l) => (
              <a key={l.label} className="link-chip" href={l.url} target="_blank" rel="noreferrer">
                {l.icon} {l.label}
              </a>
            ))}
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            予約サイトはアプリから直接予約できる仕組み（公開API）がないため、検索結果を開きます。
          </p>
        </div>
      )}
      {planId && !shared && (
        <div className="card">
          <ShareButton planId={planId} title={siteName || "キャンプ"} />
        </div>
      )}
      {planId && !shared && (
        <div className="card" style={{ textAlign: "center" }}>
          <p className="muted" style={{ marginTop: 0 }}>
            キャンプから帰ったら、この計画の日記を書きましょう。予報と実際の体感の差が、次の診断に活かされます。
          </p>
          <Link href={`/diary?plan=${planId}`} className="btn btn-primary" style={{ marginTop: 0 }}>
            📔 この計画の日記を書く
          </Link>
        </div>
      )}
    </section>
  );
}
