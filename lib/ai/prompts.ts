import { NIGHTS_LABELS, type CampPlanInput, type DiaryEntry, type Gear, type PlaceRef } from "@/lib/domain";
import type { ForecastResult } from "@/lib/weather/forecast";

// プロトタイプの combinedInput / diarySummary を移植したもの。
// 注意: 出力形式は構造化出力のスキーマ（lib/ai/schemas.ts）で縛る。JSON構造の値の部分に
// 「(100字程度)」のような指示を書かず、文字数などの指示はこの文章側に書く。

const CATEGORY_GUIDE =
  "shelter_and_sleep（テント・寝具）, fire_and_cooking（焚き火・調理）, clothing（服装・防寒）, safety_and_tools（安全・工具）, optional_comfort_items（快適装備）, other（その他）";

export const DIAGNOSIS_SYSTEM = `あなたはプロのキャンプアドバイザーです。キャンプ計画とユーザーの所持ギア一覧をもとに、リスク分析・ギアのマッチング・パッキングリスト作成を一度にまとめて行います。

手順:
0. 地形（site_terrain）と地面（site_ground）を短く書く。入力があればその内容をそのまま使う。「未入力」なら、キャンプ場名・所在地・標高から推定する（例: site_terrain=「高原の開けた草地」、site_ground=「芝生（雨後はぬかるみやすい）」）。分からなければ「不明」と書く。
1. 環境・気候リスク（environment_risks）と生物・サイト特有のリスク（bio_site_risks）を分析し、それぞれ severity(1〜5) を付ける。各リスクの risk は20〜30字程度で簡潔に書く。
   - severity は「起こりやすさ」と「起きたときの影響の大きさ」を合わせた危険度。次の目安に合わせる:
     5=中止・延期を検討すべき（予報で大雨・暴風・台風・大雪、装備では防げない氷点下の冷え込み など）
     4=しっかり対策しないとケガ・体調不良・撤収困難が起こりやすい（最低気温5℃以下、瞬間風速10m/s以上、降水確率70%以上でまとまった雨 など）
     3=対策が必要（最低気温10℃以下の冷え込み、にわか雨の可能性、クマの生息域、虫の多い時期の水辺 など）
     2=軽い注意で足りる
     1=ほぼ心配ない
   - 季節・地域の一般的傾向（basis=season_region）だけを根拠にするリスクは、原則3以下にする。ヒグマ生息域など特に危険が大きい場合だけ4にしてよい。
   - 「予定日が未入力」「データがない」こと自体はリスクとして挙げない（必要なら総合アドバイスで触れる）。
   - 各リスクに、何をもとに判断したかを basis で示す: forecast=【天気予報】の数値、terrain=標高・地形・地面、season_region=季節と地域の一般的な傾向、diary=過去の日記、input=ユーザーの入力内容（移動手段・同行者など）。
   - 【天気予報】がある場合、気温・降水・風のリスクは必ずその数値を根拠にし、risk の文中に数値を入れる（例:「夜間最低2℃、結露と冷え込みに注意」）。予報がない場合は forecast を使わない。
   - クマ・ハチ・虫などの生物リスクは、季節と地域の一般的な傾向として述べる（basis=season_region）。最近の出没情報や事故など、与えられていない具体的な事実は作らない。
   - 滞在タイプに合わせる:
     デイキャンプ（日帰り）: 就寝や夜間に関するリスク・装備（寝袋・マット・夜の冷え込み・結露など）は挙げない。日差し・熱中症・日中の雨風・撤収時刻・帰りの運転の疲れを重視する。
     連泊: 日ごとの天気の変化（2日目以降の雨・風・冷え込み）、泊数分の食料・水・燃料・着替え、濡れた装備を乾かせるか、ゴミの量を考える。
2. 今回のキャンプで推奨されるギアタグを recommended_tags に抽出する（#記号なしの日本語の単語）。
3. 所持ギア一覧の中から、表記揺れ・類義語・関連する上位/下位概念も考慮し、推奨タグに合致するものを柔軟に判定する。
4. カテゴリ別パッキングリスト（packing_list）を作る。
   - category は ${CATEGORY_GUIDE} のいずれか。
   - 所持ギアで賄えるものは、そのギアの名前をそのまま item に使い、そのギアの id を gear_id に入れる。
   - 賄えないものは具体的な商品名を item にして、gear_id は null にする。
   - 各アイテムに priority を付ける: must=安全・快適さに直結し必須、recommended=あると安心、optional=余裕があれば任意。
   - 「定番装備」と記載された所持ギアは、今回の条件に関わらず必ず含める。
   - デイキャンプなら寝具など泊まりの装備は入れない。連泊なら食料・水・燃料・着替えは泊数分の量を意識する。
5. 全体を踏まえた総合アドバイス（overall_advice）を150字程度で書く。何を優先すべきか、リスクへの向き合い方を含める。過去の日記がある場合は、その傾向を踏まえる（例えば「寒すぎ」が多ければ防寒をより手厚く提案する）。
   日記に「予報」と「体感」の両方がある場合は、その差をこの人の感じ方の傾向として使う（例: 予報の最低8℃で「寒すぎ」だったなら、今回も予報より寒く感じる前提で防寒を手厚くする）。`;

function fmt(value: string | number | null | undefined, unit = ""): string {
  return value === null || value === undefined || value === "" ? "未入力" : `${value}${unit}`;
}

/** 日記に、もとになった診断の予報（滞在中の集計）を添えたもの */
export type DiaryWithForecast = DiaryEntry & {
  forecast?: { temp_min: number | null; temp_max: number | null; precip_prob_max: number | null } | null;
};

export function diarySummary(entries: DiaryWithForecast[]): string {
  if (entries.length === 0) return "";
  const lines = entries
    .map((e) => {
      const parts = [
        `体感:${e.temp_feel}`,
        `虫:${e.bugs}`,
        `天候:${e.weather}`,
      ];
      // デイキャンプの眠りの質は入力していない（仮の値）ので渡さない
      if (e.nights !== 0) parts.push(`睡眠:★${e.sleep_quality}`);
      if (e.nights != null) parts.unshift(`滞在:${NIGHTS_LABELS[e.nights]}`);
      const f = e.forecast;
      if (f && (f.temp_min !== null || f.temp_max !== null)) {
        parts.push(
          `そのときの予報:最低${f.temp_min ?? "?"}℃/最高${f.temp_max ?? "?"}℃・降水確率${f.precip_prob_max ?? "?"}%`,
        );
      }
      if (e.bad_gear.length) parts.push(`合わなかった物:${e.bad_gear.join("・")}`);
      if (e.note) parts.push(`メモ:${e.note}`);
      return `- ${e.date} ${parts.join(", ")}`;
    })
    .join("\n");
  return `

【この人の過去のキャンプ日記（傾向として参考にしてください。例えば「寒すぎ」が多ければ防寒をより手厚く提案する）】
${lines}`;
}

function num(v: number | null | undefined, unit: string): string {
  return v === null || v === undefined ? "不明" : `${v}${unit}`;
}

/** 天気予報をプロンプト用の文章にする */
export function forecastSummary(weather: ForecastResult | null | undefined): string {
  if (!weather) return "";
  if (!weather.available) return `\n\n【天気予報】\n（なし: ${weather.message}）`;
  const f = weather.forecast;
  const days = f.days
    .map(
      (d) =>
        `- ${d.date}: ${d.weather}、最高${num(d.temp_max, "℃")}／最低${num(d.temp_min, "℃")}、降水確率最大${num(d.precip_prob_max, "%")}、降水量${num(d.precip_sum_mm, "mm")}、最大風速${num(d.wind_max_ms, "m/s")}（瞬間${num(d.gust_max_ms, "m/s")}）`,
    )
    .join("\n");
  const s = f.stay;
  return `\n\n【天気予報（Open-Meteo、取得: ${f.fetched_at.slice(0, 16)}）】
${days}
- 滞在時間帯（${f.window ?? "初日12時〜翌日12時"}）: 気温${num(s.temp_min, "℃")}〜${num(s.temp_max, "℃")}、降水確率最大${num(s.precip_prob_max, "%")}、降水量合計${num(s.precip_total_mm, "mm")}、最大風速${num(s.wind_max_ms, "m/s")}、最大瞬間風速${num(s.gust_max_ms, "m/s")}`;
}

export function buildDiagnosisPrompt(
  plan: CampPlanInput,
  gears: Gear[],
  diaries: DiaryWithForecast[],
  context: { location?: PlaceRef | null; weather?: ForecastResult | null } = {},
): string {
  const gearDesc = gears.length
    ? gears
        .map((g) => `- id=${g.id} ${g.name}（タグ: ${g.tags.join(", ") || "なし"}${g.is_base ? "、定番装備" : ""}）`)
        .join("\n")
    : "（所持ギアの登録なし）";

  const temps = [
    plan.expected_low_c != null ? `予想最低気温: ${plan.expected_low_c}℃` : null,
    plan.expected_high_c != null ? `予想最高気温: ${plan.expected_high_c}℃` : null,
  ].filter(Boolean);

  return `【キャンプ計画・環境データ】
- キャンプ場名: ${plan.campsite}${
    context.location
      ? `\n- 所在地: ${context.location.address || context.location.name}（緯度${context.location.lat.toFixed(3)}, 経度${context.location.lon.toFixed(3)}）`
      : ""
  }
- 標高: ${fmt(plan.elevation_m, "m")}${context.location?.elevation_m != null ? `（国土地理院の標高データ: ${context.location.elevation_m}m）` : ""}
- 地形: ${fmt(plan.terrain)}
- 地面の性質: ${fmt(plan.ground)}
- 滞在: ${NIGHTS_LABELS[plan.nights] ?? "1泊"}
- 予定日（初日）: ${fmt(plan.planned_date)}${temps.length ? ` (${temps.join(" / ")})` : ""}
- 移動手段: ${fmt(plan.transport)}
- 同行者: ${fmt(plan.companions)}
- 今回のスタイル: ${fmt(plan.style)}${forecastSummary(context.weather)}${diarySummary(diaries)}

【ユーザーの所持ギア一覧】
${gearDesc}

このキャンプ計画を診断してください。`;
}

export const GEAR_SUGGEST_SYSTEM = `あなたはキャンプギアの分類アシスタントです。
キャンプギアの名前から、カテゴリと関連するタグを提案します。
- category: ${CATEGORY_GUIDE} のいずれかのキー。
- tags: 関連するタグを5個程度、日本語の単語で（#記号なし）。`;

export function buildGearSuggestPrompt(name: string): string {
  return `「${name}」というキャンプギアのカテゴリとタグを提案してください。`;
}

// 1枚の写真に複数のギアが写っていてもまとめて登録できるよう、すべて列挙させる
export const GEAR_RECOGNIZE_MAX_ITEMS = 15;

export const GEAR_RECOGNIZE_SYSTEM = `あなたはキャンプギアの画像認識アシスタントです。
画像に写っているキャンプギアをすべて特定し、items に1つずつ入れます（最大${GEAR_RECOGNIZE_MAX_ITEMS}個）。
- name: ギア名。ブランド名や型番が読み取れる場合は含める。
- category: ${CATEGORY_GUIDE} のいずれかのキー。
- tags: 関連するタグを5個程度、日本語の単語で（#記号なし）。
- 同じ種類のものが複数あっても（例: ペグ10本）1つにまとめる。
- 収納袋・付属品など、本体と一体のものは本体に含めて別に数えない。
- 人・車・地面・背景の自然物などキャンプギアでないものは入れない。
- キャンプギアが写っていない、または判別できない場合は items を空配列にする。`;
