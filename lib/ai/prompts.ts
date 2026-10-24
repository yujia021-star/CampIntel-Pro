// ギアのタグ提案・写真認識のプロンプト。
// 注意: 出力形式は構造化出力のスキーマ（lib/ai/schemas.ts）で縛る。文字数などの指示はこの文章側に書く。
// （プラン診断はAIを使わず、lib/rules/ のルールで組み立てる）

const CATEGORY_GUIDE =
  "shelter_and_sleep（テント・寝具）, fire_and_cooking（焚き火・調理）, clothing（服装・防寒）, safety_and_tools（安全・工具）, optional_comfort_items（快適装備）, other（その他）";

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
