import type { Category, Gear, Priority } from "@/lib/domain";
import type { Forecast } from "@/lib/weather/forecast";

// 持ち物をルールで出す（AIを使わない）。
// 季節・泊数・予報・同行者・移動手段から必要な物を決め、マイギアの名前とタグで「持っているか」を照らし合わせる。

export interface PackingContext {
  nights: number;
  /** 予定日の月（1〜12） */
  month: number;
  stay: Forecast["stay"] | null;
  /** 予報（滞在中）の天気の種類（「雨」「雷雨」など） */
  labels: string[];
  transport: string | null;
  companions: string | null;
  /** クマの生息域か（リスクのルールで判定） */
  bear: boolean;
  /** 予報より寒く感じやすい人か（日記の体感のクセ） */
  feelsCold: boolean;
}

export interface RuleItem {
  item: string;
  category: Category;
  priority: Priority;
  consumable: boolean;
  /** 持っているギアの名前・タグに含まれていれば「所持」とみなす言葉 */
  match?: RegExp;
  /** どのキャンプでも持っていく定番の物（今回の条件で足したものではない）。登録していなくても目立たせない */
  routine: boolean;
}

const walk = (t: string | null) => Boolean(t && /徒歩|公共交通|電車|バス/.test(t));
const kids = (c: string | null) => Boolean(c && /子どもあり|家族|子連れ/.test(c) && !/子どもなし/.test(c));

/** 条件から必要な持ち物を並べる（同じ物は先に出た方を残す） */
export function packingRules(c: PackingContext): RuleItem[] {
  const out: RuleItem[] = [];
  // 条件（天気・季節・同行者など）で足す物
  const add = (item: string, category: Category, priority: Priority, match?: RegExp, consumable = false) =>
    out.push({ item, category, priority, consumable, match, routine: false });
  // どのキャンプでも使う定番の物
  const base = (item: string, category: Category, priority: Priority, match?: RegExp, consumable = false) =>
    out.push({ item, category, priority, consumable, match, routine: true });
  const overnight = c.nights > 0;
  const min = c.stay?.temp_min ?? null;
  const max = c.stay?.temp_max ?? null;
  const prob = c.stay?.precip_prob_max ?? 0;
  const mm = c.stay?.precip_total_mm ?? 0;
  const gust = c.stay?.gust_max_ms ?? 0;
  const rain = prob >= 50 || mm >= 1 || c.labels.some((l) => /雨|雷/.test(l));
  // 寒がりの人は2℃低い前提で考える
  const feltMin = min === null ? null : c.feelsCold ? min - 2 : min;
  const light = walk(c.transport);

  // 寝る・泊まる
  if (overnight) {
    base("テント", "shelter_and_sleep", "must", /テント|シェルター|ドーム|ワンポール|ツールーム/);
    base("寝袋", "shelter_and_sleep", "must", /寝袋|シュラフ|スリーピング/);
    base(feltMin !== null && feltMin <= 10 ? "断熱マット" : "マット", "shelter_and_sleep", "must", /マット|パッド|コット/);
    base("ペグ・ハンマー", "safety_and_tools", "recommended", /ペグ|ハンマー/);
    base("ランタン", "safety_and_tools", "must", /ランタン/);
    base("ヘッドライト", "safety_and_tools", "recommended", /ヘッドライト|ヘッドランプ/);
  } else {
    base("レジャーシート", "optional_comfort_items", "recommended", /シート/);
  }

  // 料理・水・ゴミ
  base("バーナー・コンロ", "fire_and_cooking", "recommended", /バーナー|コンロ|ストーブ|ST-\d/);
  base("ガス缶（OD缶・CB缶）", "fire_and_cooking", "recommended", /OD缶|CB缶|ガス缶|カートリッジ/, true);
  base("クッカー・食器", "fire_and_cooking", "recommended", /クッカー|鍋|食器|シェラカップ|ケトル|メスティン/);
  base(overnight ? `食料（${c.nights}泊分）` : "食料", "other", "must", undefined, true);
  base(overnight ? "飲料水（1人1日2Lが目安）" : "飲料水", "other", "must", undefined, true);
  base("ゴミ袋", "other", "must", /ゴミ袋|ごみ袋/, true);
  if (!light && (overnight || (max ?? 0) >= 20)) base("クーラーボックス", "fire_and_cooking", "recommended", /クーラー/);
  base("焚き火台", "fire_and_cooking", "optional", /焚き火|焚火|ファイアグリル/);
  base("薪・着火剤", "fire_and_cooking", "optional", /薪|着火剤/, true);

  // くつろぐ
  base("チェア", "optional_comfort_items", light ? "optional" : "recommended", /チェア|椅子|イス/);
  base("テーブル", "optional_comfort_items", light ? "optional" : "recommended", /テーブル/);

  // 雨・風
  if (rain) {
    add("レインウェア", "clothing", "must", /レイン|カッパ|雨具/);
    add("タープ", "shelter_and_sleep", "recommended", /タープ|シェード/);
    add("予備のタオル・着替え", "clothing", "recommended", /タオル/);
  }
  if (gust >= 10) add("予備のペグ・張り綱", "safety_and_tools", "recommended", /ロープ|張り綱|ガイライン/);

  // 寒さ・暑さ
  if (feltMin !== null && feltMin <= 10) add("防寒着（フリース・ダウン）", "clothing", "must", /ダウン|フリース|ジャケット|防寒/);
  if (feltMin !== null && feltMin <= 5) {
    add("ニット帽・手袋", "clothing", "recommended", /ニット|手袋|グローブ/);
    add("カイロ", "other", c.feelsCold ? "must" : "recommended", /カイロ/, true);
  }
  if (c.feelsCold && feltMin !== null && feltMin <= 8) add("湯たんぽ", "shelter_and_sleep", "recommended", /湯たんぽ/);
  if ((max ?? 0) >= 27) {
    add("帽子・日よけ", "clothing", "recommended", /帽子|ハット|キャップ/);
    add("日焼け止め", "other", "recommended", /日焼け止め/, true);
    add("塩分タブレット・多めの水", "other", "recommended", undefined, true);
  }
  if (overnight && (min ?? 0) >= 22) add("扇風機", "optional_comfort_items", "recommended", /扇風機|ファン|サーキュレーター/);

  // 季節・地域
  if (c.month >= 5 && c.month <= 10) add("虫よけスプレー", "safety_and_tools", "recommended", /虫よけ|虫除け|蚊取り/, true);
  if (c.bear) {
    add("熊鈴・熊よけスプレー", "safety_and_tools", "recommended", /熊/);
    add("食料を保管する密閉容器", "fire_and_cooking", "recommended", /密閉|ストレージ|フードコンテナ/);
  }

  // 安全・子ども
  base("救急セット", "safety_and_tools", "recommended", /救急|ファーストエイド|絆創膏/);
  base("モバイルバッテリー", "safety_and_tools", "recommended", /モバイルバッテリー|ポータブル電源/);
  if (kids(c.companions)) {
    add("子どもの着替え（多め）", "clothing", "must");
    add("子どもの遊び道具", "optional_comfort_items", "optional");
  }

  const seen = new Set<string>();
  return out.filter((r) => (seen.has(r.item) ? false : (seen.add(r.item), true)));
}

/** マイギアから、その持ち物にあたるギアを探す（名前とタグで）。1つのギアは1つの持ち物にだけ使う */
export function matchGears(
  items: RuleItem[],
  gears: Gear[],
): { item: string; category: Category; priority: Priority; consumable: boolean; routine: boolean; gear_id: string | null }[] {
  const used = new Set<string>();
  return items.map((r) => {
    const gear = r.match
      ? gears.find((g) => !used.has(g.id) && (r.match!.test(g.name) || g.tags.some((t) => r.match!.test(t))))
      : undefined;
    if (gear) used.add(gear.id);
    return { item: gear?.name ?? r.item, category: r.category, priority: r.priority, consumable: r.consumable, routine: r.routine, gear_id: gear?.id ?? null };
  });
}
