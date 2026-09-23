import { CATEGORIES, type CampPlanInput, type DiaryEntry, type Gear } from "@/lib/domain";

// 注意: JSON構造の値の部分に「(100字程度)」のような指示を書かないこと。
// 出力形式は構造化出力のスキーマで縛り、内容の指示はこの文章側に書く。

export const DIAGNOSIS_SYSTEM = `あなたは日本のキャンプに精通したアウトドアの専門家です。
ユーザーのキャンプ計画・所持ギア・過去の日記をもとに、データに基づいたリスク分析と準備のアドバイスを日本語で行います。

分析は次の5つの変数グループの観点で考えてください。
1. 自然・環境変数（標高、地形、気温、地面の固さ など）
2. 生物・リスク変数（クマ、ハチ、ブヨ・蚊・ヒル などの生息リスク）
3. 設備・インフラ変数（AC電源、水まわり、ゴミ捨て場）
4. サイト・レイアウト変数（オートサイト、フリーサイト など）
5. パーソナル変数（移動手段、同行者、スタイル、過去の日記の傾向）

出力する各項目のルール:
- environment_risks: 環境・気候に関するリスク。2〜5件。
- bio_site_risks: 生物・サイト・設備に関するリスク。1〜4件。
- 各リスクの severity は 1（ほぼ心配なし）〜 5（重大・対策必須）の整数。根拠のない誇張はしない。
- title は20字以内、detail は具体的な対策を含めて80字程度。
- recommended_tags: この計画で必要になるギアの特徴タグ。先頭に#を付けず、短い日本語または英小文字で5〜10個。
- packing_list: カテゴリ別の持ち物リスト。15〜30件。
  - category は ${CATEGORIES.join(" / ")} のいずれか。
  - priority は must（必須）/ recommended（推奨）/ optional（任意）。
  - 所持ギア一覧の中に該当するものがあれば、そのギアの id を gear_id に入れ、item はそのギア名にする。所持していない物は gear_id を null にする。
  - 所持ギアのうち「定番」と書かれたものは必ず含める。
  - 同じ物を重複させない。reason は40字以内。
- overall_advice: 計画全体への総合アドバイス。200字程度。過去の日記がある場合は、その傾向（寒がり・虫・眠りの質・合わなかったギアなど）を踏まえた提案を必ず含める。`;

function fmt(value: string | number | null | undefined, unit = ""): string {
  return value === null || value === undefined || value === "" ? "未入力" : `${value}${unit}`;
}

export function buildDiagnosisPrompt(plan: CampPlanInput, gears: Gear[], diaries: DiaryEntry[]): string {
  const planText = [
    `キャンプ場: ${plan.campsite}`,
    `標高: ${fmt(plan.elevation_m, "m")}`,
    `地形: ${fmt(plan.terrain)}`,
    `地面の性質: ${fmt(plan.ground)}`,
    `予定日: ${fmt(plan.planned_date)}`,
    `予想気温: 最低 ${fmt(plan.expected_low_c, "℃")} / 最高 ${fmt(plan.expected_high_c, "℃")}`,
    `移動手段: ${fmt(plan.transport)}`,
    `同行者: ${fmt(plan.companions)}`,
    `スタイル: ${fmt(plan.style)}`,
  ].join("\n");

  const gearText =
    gears.length === 0
      ? "（登録なし）"
      : gears
          .map(
            (g) =>
              `- id=${g.id} | ${g.name} | ${g.category} | tags: ${g.tags.join(", ") || "なし"}${g.is_base ? " | 定番" : ""}`,
          )
          .join("\n");

  const diaryText =
    diaries.length === 0
      ? "（記録なし）"
      : diaries
          .map((d) => {
            const parts = [
              `${d.date} ${d.campsite ?? "キャンプ場不明"}`,
              `天気:${d.weather}`,
              `体感:${d.temp_feel}`,
              `虫:${d.bugs}`,
              `眠り:${d.sleep_quality}/5`,
            ];
            if (d.good_gear.length) parts.push(`良かったギア:${d.good_gear.join("・")}`);
            if (d.bad_gear.length) parts.push(`合わなかったギア:${d.bad_gear.join("・")}`);
            if (d.note) parts.push(`メモ:${d.note}`);
            return `- ${parts.join(" / ")}`;
          })
          .join("\n");

  return `<camp_plan>
${planText}
</camp_plan>

<my_gear>
${gearText}
</my_gear>

<recent_diary count="${diaries.length}">
${diaryText}
</recent_diary>

上記の計画を診断し、リスク・推奨タグ・パッキングリスト・総合アドバイスをまとめて出力してください。`;
}

export const GEAR_SUGGEST_SYSTEM = `あなたはキャンプギアの分類アシスタントです。
ギア名から、そのギアの特徴を表すタグとカテゴリを提案します。
- tags: 3〜6個。先頭に#を付けない。用途・季節・特性を表す短い日本語（例: 防寒, 冬用, 軽量, 雨対策, 虫よけ, 焚き火）。
- category: ${CATEGORIES.join(" / ")} のいずれか。判断できなければ other。`;

export function buildGearSuggestPrompt(name: string): string {
  return `<gear_name>${name}</gear_name>\nこのギアのタグとカテゴリを提案してください。`;
}

export const GEAR_RECOGNIZE_SYSTEM = `あなたはキャンプギアの画像認識アシスタントです。
写真に写っている主なキャンプギアを1つ特定し、名前・タグ・カテゴリを返します。
- name: 一般的な名称。ブランドや型番が読み取れる場合は含める。30字以内。
- tags: 3〜6個。先頭に#を付けない短い日本語。
- category: ${CATEGORIES.join(" / ")} のいずれか。
- キャンプギアが写っていない、または判別できない場合は recognized を false にし、name は空文字、tags は空配列、category は other にする。`;
