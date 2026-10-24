import type { Risk } from "@/lib/domain";
import type { Forecast } from "@/lib/weather/forecast";

// 診断のリスクをルールで出す（AIを使わない。同じ条件なら毎回同じ結果、料金0円）。
// - 天気（雨・風・気温・雷・雪・霧）：予報の数字と天気の種類から
// - 季節・地域の一般的傾向（クマ・虫・ハチ）：都道府県・標高・月から
// - 標高・入力内容：標高、移動手段、同行者から
// - 行き帰りの路面凍結：最低気温と雨・雪、移動手段から

const RAIN_EXTREME_MM = 50;

/**
 * 予報の数字から天気のリスクを出す。
 * 危険度の目安：5=中止・延期を検討／4=しっかり対策しないとケガや体調不良が起きやすい／3=対策が必要／2=軽い注意
 * 数字だけでは分からない雷・雪・凍結・霧は、滞在中の天気（labels: 「雷雨」「大雪」など）から出す。
 */
export function weatherRisks(stay: Forecast["stay"], nights: number, labels: string[] = []): Risk[] {
  const out: Risk[] = [];
  const has = (re: RegExp) => labels.some((l) => re.test(l));
  if (has(/雷/)) out.push({ risk: "雷雨の予報。落雷に備え、車や建物にすぐ避難できるように", severity: 4, basis: "forecast" });
  if (has(/大雪|強いにわか雪/)) out.push({ risk: "大雪の予報。道路の通行止めやテントの積雪に注意", severity: 5, basis: "forecast" });
  else if (has(/雪/)) out.push({ risk: "雪の予報。スタッドレスタイヤ・チェーンと雪対策を", severity: 4, basis: "forecast" });
  if (has(/着氷/)) out.push({ risk: "着氷性の雨・霧の予報。路面やテントの凍結に注意", severity: 4, basis: "forecast" });
  else if (has(/^霧$/)) out.push({ risk: "霧の予報。視界が悪くなるので運転と夜の移動に注意", severity: 2, basis: "forecast" });
  const p = stay.precip_prob_max;
  const mm = stay.precip_total_mm ?? 0;
  if (p !== null) {
    const sev = mm >= RAIN_EXTREME_MM ? 5 : p >= 70 && mm >= 10 ? 4 : (p >= 50 && mm >= 3) || p >= 70 ? 3 : p >= 30 ? 2 : 0;
    if (sev) out.push({ risk: `降水確率最大${p}%・合計${mm}mm。撤収時の濡れや浸水に備える`, severity: sev, basis: "forecast" });
  }
  const g = stay.gust_max_ms;
  const w = stay.wind_max_ms;
  if (g !== null || w !== null) {
    const gust = g ?? 0;
    const wind = w ?? 0;
    const sev = gust >= 20 ? 5 : gust >= 15 || wind >= 10 ? 4 : gust >= 10 || wind >= 6 ? 3 : gust >= 7 ? 2 : 0;
    if (sev) out.push({ risk: `最大瞬間風速${gust}m/s。タープ・テントの張り綱とペグをしっかり`, severity: sev, basis: "forecast" });
  }
  const min = stay.temp_min;
  if (min !== null) {
    const sev = min <= -5 ? 5 : min <= 5 ? 4 : min <= 10 ? 3 : min <= 15 && nights > 0 ? 2 : 0;
    if (sev) {
      const text = nights > 0 ? `夜の最低${min}℃。寝袋・マット・防寒着で冷え込み対策を` : `最低${min}℃。防寒着を用意する`;
      out.push({ risk: text, severity: sev, basis: "forecast" });
    }
    if (nights > 0 && min >= 25) out.push({ risk: `夜も${min}℃の熱帯夜。寝苦しさと熱中症に注意`, severity: 3, basis: "forecast" });
  }
  const max = stay.temp_max;
  if (max !== null) {
    const sev = max >= 35 ? 4 : max >= 30 ? 3 : max >= 27 ? 2 : 0;
    if (sev) out.push({ risk: `最高${max}℃。熱中症・日差し対策を`, severity: sev, basis: "forecast" });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

/**
 * 行き帰りの路面凍結（車のときだけ）。
 * 路面は気温より冷えやすく、気温3℃以下で橋の上・日陰・峠道が凍ることがある。前後に雨や雪があると凍りやすい。
 * minTemp は滞在する日（行き帰りの早朝を含む）の最低気温。
 */
export function roadRisks(c: { minTemp: number | null; wet: boolean; transport: string | null }): Risk[] {
  if (c.minTemp === null || !c.transport || isWalking(c.transport)) return [];
  const t = c.minTemp;
  if (t <= 0 && c.wet) {
    return [{ risk: `朝の最低${t}℃で雨や雪のあと。路面凍結のおそれが高い。スタッドレスタイヤかチェーンを`, severity: 4, basis: "forecast" }];
  }
  if (t <= 0) {
    return [{ risk: `朝の最低${t}℃。行き帰りの路面凍結に注意。橋の上・日陰・峠道は特にゆっくり`, severity: 3, basis: "forecast" }];
  }
  if (t <= 3) {
    return [{ risk: `朝の最低${t}℃。橋の上や日陰の道は凍ることがある`, severity: 2, basis: "forecast" }];
  }
  return [];
}

export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
  "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
  "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

/** 住所や名前から都道府県を取り出す（「静岡県 富士宮市」「静岡県富士宮市麓」など） */
export function prefectureOf(text: string | null | undefined): string | null {
  if (!text) return null;
  return PREFECTURES.find((p) => text.includes(p)) ?? null;
}

// ツキノワグマが広く生息する都府県（一般的な傾向。最新の出没は自治体の情報で確認する）
const BLACK_BEAR = new Set([
  "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "栃木県", "群馬県", "埼玉県", "東京都",
  "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県",
  "広島県", "山口県", "徳島県", "高知県",
]);
// 里に近い所でも出没が多い地域
const BEAR_DENSE = new Set(["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "新潟県", "富山県", "石川県", "長野県", "岐阜県", "群馬県"]);

export interface SiteContext {
  /** 予定日の月（1〜12） */
  month: number;
  prefecture: string | null;
  elevation_m: number | null;
  nights: number;
  transport: string | null;
  companions: string | null;
}

const between = (m: number, from: number, to: number) => m >= from && m <= to;

/** 季節・地域の一般的傾向のリスク（クマ・虫・ハチ） */
export function regionRisks(c: SiteContext): Risk[] {
  const out: Risk[] = [];
  const active = between(c.month, 4, 11); // 冬眠していない時期
  if (active && c.prefecture === "北海道") {
    out.push({ risk: "ヒグマの生息域。食料とゴミは車内に保管し、熊鈴を", severity: 4, basis: "season_region" });
  } else if (active && c.prefecture && BLACK_BEAR.has(c.prefecture)) {
    const mountain = (c.elevation_m ?? 0) >= 300;
    if (mountain || BEAR_DENSE.has(c.prefecture)) {
      out.push({ risk: "ツキノワグマの生息域。食料は車内に保管し、熊鈴を", severity: 3, basis: "season_region" });
    }
  }
  if (between(c.month, 4, 10)) {
    const bugs = between(c.month, 6, 9) ? "蚊・ブヨ・マダニ" : "マダニ";
    out.push({ risk: `${bugs}の時期。長袖・長ズボンと虫よけを`, severity: 2, basis: "season_region" });
  }
  if (between(c.month, 7, 10)) {
    out.push({ risk: "スズメバチの活動期。黒い服や甘い匂いを避ける", severity: 2, basis: "season_region" });
  }
  return out;
}

const isWalking = (t: string | null) => Boolean(t && /徒歩|公共交通|電車|バス/.test(t));
const hasKids = (c: string | null) => Boolean(c && /子どもあり|家族|子連れ/.test(c) && !/子どもなし/.test(c));

/** 標高・入力内容のリスク */
export function siteRisks(c: SiteContext): Risk[] {
  const out: Risk[] = [];
  if ((c.elevation_m ?? 0) >= 1000) {
    out.push({ risk: `標高${c.elevation_m}m。天気が急に変わりやすく、夜は冷え込みやすい`, severity: 2, basis: "terrain" });
  }
  if (isWalking(c.transport) && c.nights > 0) {
    out.push({ risk: "徒歩・公共交通機関なので荷物は軽く。重い物は現地のレンタルも検討", severity: 2, basis: "input" });
  }
  if (hasKids(c.companions)) {
    out.push({ risk: "子ども連れ。水辺・焚き火・車の出入りから目を離さない", severity: 2, basis: "input" });
  }
  return out;
}
