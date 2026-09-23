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
  created_at: string;
}

/** 診断フォームの入力（camp_plans の列に対応） */
export interface CampPlanInput {
  campsite: string;
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

export interface Risk {
  risk: string;
  severity: number; // 1〜5
}

export interface PackingItem {
  item: string;
  category: Category;
  priority: Priority;
  /** 所持ギアのID。所持していなければ null（＝要準備） */
  gear_id: string | null;
  owned: boolean;
  is_base: boolean;
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
}
