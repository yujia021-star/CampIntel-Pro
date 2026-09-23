// campintel のドメイン型と定数（DBスキーマと対応）

export const CATEGORIES = [
  "shelter_and_sleep",
  "fire_and_cooking",
  "clothing",
  "safety_and_tools",
  "optional_comfort_items",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  shelter_and_sleep: "⛺ テント・寝具",
  fire_and_cooking: "🔥 焚き火・調理",
  clothing: "🧥 服装・防寒",
  safety_and_tools: "🛠️ 安全・工具",
  optional_comfort_items: "☕ 快適装備",
  other: "📦 その他",
};

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

export const WEATHERS = ["晴れ", "曇り", "雨"] as const;
export const TEMP_FEELS = ["寒すぎ", "ちょうどいい", "暑すぎ"] as const;
export const BUGS = ["なし", "少し", "多い"] as const;
export type Weather = (typeof WEATHERS)[number];
export type TempFeel = (typeof TEMP_FEELS)[number];
export type Bugs = (typeof BUGS)[number];

export interface Gear {
  id: string;
  user_id: string;
  name: string;
  tags: string[];
  category: Category;
  is_base: boolean;
  created_at: string;
}

export interface DiaryEntry {
  id: string;
  user_id: string;
  campsite: string | null;
  date: string;
  weather: Weather;
  temp_feel: TempFeel;
  bugs: Bugs;
  sleep_quality: number;
  good_gear: string[];
  bad_gear: string[];
  note: string | null;
  /** 泊数（0=デイ）。以前の記録は null */
  nights?: number | null;
  /** もとになった診断（camp_plans.id） */
  plan_id?: string | null;
  created_at: string;
}

/** 泊数（0 = デイキャンプ） */
export const NIGHTS_OPTIONS = [0, 1, 2] as const;
export const NIGHTS_LABELS: Record<number, string> = { 0: "デイキャンプ", 1: "1泊", 2: "2泊" };
export const NIGHTS_ICONS: Record<number, string> = { 0: "🌞", 1: "🌙", 2: "🌙🌙" };

/** 診断フォームの入力（camp_plans の列に対応） */
export interface CampPlanInput {
  campsite: string;
  nights: number;
  elevation_m: number | null;
  terrain: string | null;
  ground: string | null;
  planned_date: string | null;
  expected_low_c: number | null;
  expected_high_c: number | null;
  transport: string | null;
  companions: string | null;
  style: string | null;
}

export interface CampPlan extends CampPlanInput {
  id: string;
  user_id: string;
  result: DiagnosisResult | null;
  created_at: string;
}

export type Priority = "must" | "recommended" | "optional";
export const PRIORITY_LABELS: Record<Priority, string> = {
  must: "必須",
  recommended: "推奨",
  optional: "任意",
};

/** リスクの根拠（何のデータをもとに判断したか） */
export const RISK_BASES = ["forecast", "terrain", "season_region", "diary", "input"] as const;
export type RiskBasis = (typeof RISK_BASES)[number];
export const RISK_BASIS_LABELS: Record<RiskBasis, string> = {
  forecast: "天気予報",
  terrain: "標高・地形",
  season_region: "季節・地域の一般的傾向",
  diary: "過去の日記",
  input: "入力内容",
};

export interface Risk {
  risk: string;
  severity: number; // 1〜5
  basis: RiskBasis;
}

/** 診断に使った条件と、その出どころ（入力欄の代わりに結果として表示する） */
export interface SiteConditions {
  elevation_m: number | null;
  elevation_source: "gsi" | "input" | null;
  temp_min: number | null;
  temp_max: number | null;
  temp_source: "forecast" | "input" | null;
  terrain: string | null;
  terrain_source: "input" | "ai" | null;
  ground: string | null;
  ground_source: "input" | "ai" | null;
}

/** 検索して選んだ場所 */
export interface PlaceRef {
  name: string;
  address: string;
  lat: number;
  lon: number;
  /** 国土地理院の標高（取得できたとき） */
  elevation_m: number | null;
  /** 場所を選ばずに診断したため、名前から自動で選んだ場所か */
  auto?: boolean;
}

export interface PackingItem {
  item: string;
  category: Category;
  priority: Priority;
  /** 所持ギアのID。所持していなければ null（＝要準備） */
  gear_id: string | null;
  owned: boolean;
  is_base: boolean;
  /** 使うと減る物（燃料・食料・ゴミ袋など）。持っていても毎回の補充・残量確認が要る */
  consumable?: boolean;
}

const CONSUMABLE_WORDS =
  /ガス缶|OD缶|CB缶|ガスカートリッジ|燃料|ホワイトガソリン|灯油|アルコール燃料|薪|炭|着火剤|固形燃料|マッチ|ゴミ袋|ごみ袋|電池|乾電池|食料|食材|飲料水|飲み水|^水|氷|ティッシュ|ウェット|トイレットペーパー|キッチンペーパー|アルミホイル|ラップ|カイロ|虫よけ|虫除け|日焼け止め|蚊取り|洗剤|調味料/;

/** 名前から消耗品らしいかを判定する（AIが判定していない古い診断結果の表示用） */
export function looksConsumable(name: string): boolean {
  return CONSUMABLE_WORDS.test(name);
}

/** 持ち物が消耗品か（AIの判定を優先し、なければ名前から推定） */
export function isConsumable(p: Pick<PackingItem, "item" | "consumable">): boolean {
  return p.consumable ?? looksConsumable(p.item);
}

export interface DiagnosisResult {
  environment_risks: Risk[];
  bio_site_risks: Risk[];
  recommended_tags: string[];
  packing_list: PackingItem[];
  overall_advice: string;
  /** 以下はコード側で計算する指標（AI任せにしない） */
  risk_level: number;
  readiness_pct: number;
  owned_count: number;
  total_count: number;
  diary_count_used: number;
  /** 診断時に使った場所と天気予報（履歴で後から見返せるように保存） */
  location?: PlaceRef | null;
  /** 滞在の日程（初日・最終日・泊数） */
  stay?: { nights: number; start: string | null; end: string | null } | null;
  conditions?: SiteConditions | null;
  weather?: import("@/lib/weather/forecast").ForecastResult | null;
  /** 診断に使った条件の指紋。同じ条件なら前回の結果を使い回す（AIの料金をかけない・結果をぶらさない） */
  fingerprint?: string;
}
