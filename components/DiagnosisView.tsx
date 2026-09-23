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
  RISK_BASIS_LABELS,
  isConsumable,
  type DiagnosisResult,
  type PackingItem,
  type Priority,
  type Risk,
  type SiteConditions,
} from "@/lib/domain";
import { hasAffiliate, reserveLinks, routeLinks, shopLinks, type AffiliateIds } from "@/lib/links";

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

function PlaceCard({ result, siteName }: { result: DiagnosisResult; siteName: string }) {
  const loc = result.location;
  const c: SiteConditions | null | undefined = result.conditions;
  if (!loc && !c && !result.stay && !siteName) return null;
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
          <div className="link-row">
            <a className="link-chip" href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lon}`} target="_blank" rel="noreferrer">
              🗺️ 地図で確認
            </a>
            <a className="link-chip" href={routeLinks(loc).google} target="_blank" rel="noreferrer">
              🚗 Googleマップで行き方
            </a>
            <a className="link-chip" href={routeLinks(loc).apple} target="_blank" rel="noreferrer">
              🍎 Appleマップで行き方
            </a>
          </div>
        </div>
      )}
      {siteName && (
        <div style={{ marginBottom: 8 }}>
          <div className="cond-label" style={{ fontSize: "0.85rem" }}>
            🏕️ 予約・空き状況
          </div>
          <div className="link-row">
            {reserveLinks(siteName).map((l) => (
              <a key={l.label} className="link-chip" href={l.url} target="_blank" rel="noreferrer">
                {l.icon} {l.label}
              </a>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 0 }}>
            予約サイトにはアプリから直接予約できる仕組みがないため、検索結果を開きます。
          </div>
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

const byPriority = (a: PackingItem, b: PackingItem) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];

/** 持ち物の1行。名前が長くても、チェックボックスと名前・通販リンクが崩れないようにする */
function PackRow({
  p,
  shop,
  note,
  plain,
}: {
  p: PackingItem;
  /** 通販リンクを出すとき、そのアフィリエイトID（なければ普通の検索リンク） */
  shop?: AffiliateIds | null;
  note?: string;
  plain?: boolean;
}) {
  return (
    <div className="pack-row">
      <label className="pack-label">
        <input type="checkbox" />
        <span className="pack-text">
          <span className="item-name">{p.item}</span>
          {p.priority === "must" && !plain && <span className="badge badge-must">必須</span>}
          {p.priority === "optional" && <span className="muted pack-note">あれば</span>}
          {note && <span className="muted pack-note">{note}</span>}
        </span>
      </label>
      {shop && (
        <span className="shop-links">
          {shopLinks(p.item, shop).map((l) => (
            <a key={l.label} href={l.url} target="_blank" rel="noreferrer sponsored">
              {l.label}
            </a>
          ))}
        </span>
      )}
    </div>
  );
}

/**
 * 持ち物。主役は「足りないギア」。消耗品は持っていても毎回の補充・残量確認が要るので別に出す。
 * 持っている道具は出発前の荷造りチェック用なので畳んでおく。
 */
function PackingCard({ result, ids }: { result: DiagnosisResult; ids: AffiliateIds }) {
  const affiliate = hasAffiliate(ids);
  const need = result.packing_list.filter((p) => !p.owned && !isConsumable(p)).sort(byPriority);
  const consumables = result.packing_list
    .filter((p) => isConsumable(p))
    .sort((a, b) => Number(a.owned) - Number(b.owned) || byPriority(a, b));
  const owned = result.packing_list.filter((p) => p.owned && !isConsumable(p));
  return (
    <div className="card">
      <h2>🎒 持ち物 {affiliate && (need.length > 0 || consumables.some((p) => !p.owned)) && <span className="pr-label">PR</span>}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        足りないギアは<b>{need.length}件</b>
        {consumables.length > 0 && (
          <>
            、消耗品は<b>{consumables.length}件</b>（残量を確認・補充）
          </>
        )}
        です。
      </p>

      {need.length > 0 ? (
        <>
          <h3 className="pack-head">🛒 用意が必要なギア（{need.length}件）</h3>
          <div className="checklist">
            {need.map((p, i) => (
              <PackRow key={`${p.item}-${i}`} p={p} shop={ids} />
            ))}
          </div>
        </>
      ) : (
        <p className="pack-ok">🎉 足りないギアはありません。</p>
      )}

      {consumables.length > 0 && (
        <>
          <h3 className="pack-head">🧻 消耗品（{consumables.length}件）</h3>
          <div className="checklist">
            {consumables.map((p, i) => (
              <PackRow key={`${p.item}-${i}`} p={p} shop={p.owned ? null : ids} note={p.owned ? "手持ちあり・残量を確認" : undefined} />
            ))}
          </div>
        </>
      )}
      {affiliate && <p className="hint">通販リンクには広告（アフィリエイト）を含みます。</p>}

      {owned.length > 0 && (
        // 持っている道具は出発前の荷造りチェック用なので、畳んでおく
        <details className="pack-owned">
          <summary>
            <span className="pack-head">✅ マイギアから持っていく（{owned.length}件）</span>
            <span className="pack-summary muted">
              {CATEGORIES.filter((c) => owned.some((p) => p.category === c))
                .map((c) => `${CATEGORY_LABELS[c]} ${owned.filter((p) => p.category === c).length}`)
                .join("・")}
            </span>
          </summary>
          <div className="checklist">
            {CATEGORIES.map((cat) => {
              const items = owned.filter((p) => p.category === cat).sort(byPriority);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="checklist-cat">{CATEGORY_LABELS[cat]}</div>
                  {items.map((p, i) => (
                    <PackRow key={`${p.item}-${i}`} p={p} plain />
                  ))}
                </div>
              );
            })}
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>出発前の荷造りチェックに使えます（チェックは保存されません）。</p>
        </details>
      )}
    </div>
  );
}

export function DiagnosisView({
  result,
  planId,
  campsite,
  companions,
  transport,
  affiliate = {},
  shared = false,
}: {
  result: DiagnosisResult;
  planId?: string | null;
  /** 入力したキャンプ場名（予約リンクに使う） */
  campsite?: string | null;
  companions?: string | null;
  transport?: string | null;
  /** アフィリエイトID（サーバーで環境変数から読んで渡す） */
  affiliate?: AffiliateIds;
  /** ログインしていない人向けの共有ページで表示するか */
  shared?: boolean;
}) {
  const siteName = campsite?.trim() || result.location?.name || "";
  const verdict = riskVerdict(result.risk_level);
  const counts = countBySeverity([...result.environment_risks, ...result.bio_site_risks]);

  return (
    <section>
      <PlaceCard result={result} siteName={siteName} />
      {result.weather && <WeatherCard weather={result.weather} title="🌦️ 診断に使った天気予報" />}
      {result.location && (
        <NearbyCard location={result.location} companions={companions} transport={transport} />
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
        {/* 根拠の説明は各リスクのラベルで足りるので、注意書きだけを短く添える */}
        <p className="hint" style={{ marginBottom: 0 }}>
          ラベルは判断のもとにしたデータです。「季節・地域の一般的傾向」はAIの一般知識で、最新の出没・事故情報は含みません。警報は
          <a href="https://www.jma.go.jp/bosai/warning/" target="_blank" rel="noreferrer">
            気象庁
          </a>
          、クマの出没は自治体、キャンプ場の状況は公式サイトで確認してください。
        </p>
      </div>

      <PackingCard result={result} ids={affiliate} />
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
