import { type CampPlanInput, type DiaryEntry, type Gear } from "@/lib/domain";

// プロトタイプの combinedInput / diarySummary を移植したもの。
// 注意: 出力形式は構造化出力のスキーマ（lib/ai/schemas.ts）で縛る。JSON構造の値の部分に
// 「(100字程度)」のような指示を書かず、文字数などの指示はこの文章側に書く。

const CATEGORY_GUIDE =
  "shelter_and_sleep（テント・寝具）, fire_and_cooking（焚き火・調理）, clothing（服装・防寒）, safety_and_tools（安全・工具）, optional_comfort_items（快適装備）, other（その他）";

export const DIAGNOSIS_SYSTEM = `あなたはプロのキャンプアドバイザーです。キャンプ計画とユーザーの所持ギア一覧をもとに、リスク分析・ギアのマッチング・パッキングリスト作成を一度にまとめて行います。

手順:
1. 環境・気候リスク（environment_risks）と生物・サイト特有のリスク（bio_site_risks）を分析し、それぞれ severity(1〜5) を付ける。severity は「対策を怠った場合に起こりうる影響の大きさ」で、1=軽微、5=重大。各リスクの risk は20〜30字程度で簡潔に書く。
2. 今回のキャンプで推奨されるギアタグを recommended_tags に抽出する（#記号なしの日本語の単語）。
3. 所持ギア一覧の中から、表記揺れ・類義語・関連する上位/下位概念も考慮し、推奨タグに合致するものを柔軟に判定する。
4. カテゴリ別パッキングリスト（packing_list）を作る。
   - category は ${CATEGORY_GUIDE} のいずれか。
   - 所持ギアで賄えるものは、そのギアの名前をそのまま item に使い、そのギアの id を gear_id に入れる。
   - 賄えないものは具体的な商品名を item にして、gear_id は null にする。
   - 各アイテムに priority を付ける: must=安全・快適さに直結し必須、recommended=あると安心、optional=余裕があれば任意。
   - 「定番装備」と記載された所持ギアは、今回の条件に関わらず必ず含める。
5. 全体を踏まえた総合アドバイス（overall_advice）を150字程度で書く。何を優先すべきか、リスクへの向き合い方を含める。過去の日記がある場合は、その傾向を踏まえる（例えば「寒すぎ」が多ければ防寒をより手厚く提案する）。`;

function fmt(value: string | number | null | undefined, unit = ""): string {
  return value === null || value === undefined || value === "" ? "未入力" : `${value}${unit}`;
}

export function diarySummary(entries: DiaryEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries
    .map((e) => {
      const parts = [
        `体感:${e.temp_feel}`,
        `虫:${e.bugs}`,
        `天候:${e.weather}`,
        `睡眠:★${e.sleep_quality}`,
      ];
      if (e.bad_gear.length) parts.push(`合わなかった物:${e.bad_gear.join("・")}`);
      if (e.note) parts.push(`メモ:${e.note}`);
      return `- ${e.date} ${parts.join(", ")}`;
    })
    .join("\n");
  return `

【この人の過去のキャンプ日記（傾向として参考にしてください。例えば「寒すぎ」が多ければ防寒をより手厚く提案する）】
${lines}`;
}

export function buildDiagnosisPrompt(plan: CampPlanInput, gears: Gear[], diaries: DiaryEntry[]): string {
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
- キャンプ場名: ${plan.campsite}
- 標高: ${fmt(plan.elevation_m, "m")}
- 地形: ${fmt(plan.terrain)}
- 地面の性質: ${fmt(plan.ground)}
- 予定日: ${fmt(plan.planned_date)}${temps.length ? ` (${temps.join(" / ")})` : ""}
- 移動手段: ${fmt(plan.transport)}
- 同行者: ${fmt(plan.companions)}
- 今回のスタイル: ${fmt(plan.style)}${diarySummary(diaries)}

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

export const GEAR_RECOGNIZE_SYSTEM = `あなたはキャンプギアの画像認識アシスタントです。
画像に写っているキャンプギアを1つ特定します。
- name: ギア名。ブランド名や型番が読み取れる場合は含める。
- category: ${CATEGORY_GUIDE} のいずれかのキー。
- tags: 関連するタグを5個程度、日本語の単語で（#記号なし）。
- キャンプギアが写っていない、または判別できない場合は recognized を false にし、name は空文字、tags は空配列、category は other にする。`;
