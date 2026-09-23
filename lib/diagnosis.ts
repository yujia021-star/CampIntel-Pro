import {
  isCategory,
  type Category,
  type DiagnosisResult,
  type Gear,
  type PackingItem,
  type CampPlanInput,
  type PlaceRef,
  type SiteConditions,
  type Priority,
  type Risk,
  type RiskBasis,
  RISK_BASES,
  looksConsumable,
} from "@/lib/domain";
import { addDays, type ForecastResult } from "@/lib/weather/forecast";
import { normalizeTags } from "@/lib/tags";

/** AIが返す生の診断結果（lib/ai/schemas.ts の DiagnosisOutputSchema と同形） */
export interface RawDiagnosis {
  site_terrain?: string;
  site_ground?: string;
  environment_risks: { risk: string; severity: number; basis: string }[];
  bio_site_risks: { risk: string; severity: number; basis: string }[];
  recommended_tags: string[];
  packing_list: {
    item: string;
    category: string;
    priority: string;
    gear_id: string | null;
    /** 使うと減る物（燃料・食料・ゴミ袋など）か。古い出力にはない */
    consumable?: boolean;
  }[];
  overall_advice: string;
}

const PRIORITIES: Priority[] = ["must", "recommended", "optional"];

function clampSeverity(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function cleanRisk(r: RawDiagnosis["environment_risks"][number]): Risk {
  // 根拠が不明なものは「一般的傾向」として扱う（データに基づくと誤解させない）
  const basis: RiskBasis = (RISK_BASES as readonly string[]).includes(r.basis) ? (r.basis as RiskBasis) : "season_region";
  return { risk: r.risk.trim(), severity: clampSeverity(r.severity), basis };
}

/**
 * 総合リスクレベル = いちばん高いリスクの危険度（1〜5）。リスクがなければ 0。
 * 平均にすると、重大なリスクが軽微なリスクに薄められて見落とされるため最大値を使う。
 */
export function computeRiskLevel(risks: Risk[]): number {
  return risks.reduce((max, r) => Math.max(max, r.severity), 0);
}

export type Tone = "ok" | "low" | "mid" | "high";

export interface RiskVerdict {
  title: string;
  text: string;
  tone: Tone;
}

// 目安: 1以下=問題なし / 2=軽度の注意 / 3=要注意 / 4=警戒 / 5=危険
// （以前の履歴は平均値なので小数のことがある。境界は「未満」で判定する）
export function riskVerdict(level: number): RiskVerdict {
  if (level < 2)
    return { title: "✅ 問題なし", tone: "ok", text: "特筆すべきリスクはありません。通常の準備で対応できるレベルです。" };
  if (level < 3)
    return {
      title: "🟡 軽度の注意",
      tone: "low",
      text: "軽度の注意が必要です。下記の推奨ギアを揃えておけば安心して楽しめます。",
    };
  if (level < 4)
    return {
      title: "🟠 要注意",
      tone: "mid",
      text: "対策が必要なリスクがあります。下のリスクと持ち物を確認して準備しましょう。",
    };
  if (level < 5)
    return {
      title: "🔴 警戒",
      tone: "high",
      text: "しっかり対策しないと危険なリスクがあります。装備を万全にし、行動計画にも余裕を持たせましょう。",
    };
  return {
    title: "⛔ 危険",
    tone: "high",
    text: "重大なリスクがあります。日程の変更や中止も検討してください。",
  };
}

/** 個々のリスクの危険度ラベル */
export function severityLabel(severity: number): { label: string; tone: Tone } {
  if (severity >= 5) return { label: "危険", tone: "high" };
  if (severity >= 4) return { label: "高", tone: "high" };
  if (severity >= 3) return { label: "注意", tone: "mid" };
  return { label: "軽微", tone: "ok" };
}

/** 危険度ごとの件数（総合評価の補足表示用） */
export function countBySeverity(risks: Risk[]): { high: number; mid: number; low: number } {
  return {
    high: risks.filter((r) => r.severity >= 4).length,
    mid: risks.filter((r) => r.severity === 3).length,
    low: risks.filter((r) => r.severity <= 2).length,
  };
}

/** 滞在の日程（初日・最終日・泊数） */
export function stayOf(plan: Pick<CampPlanInput, "nights" | "planned_date">): NonNullable<DiagnosisResult["stay"]> {
  const start = plan.planned_date;
  return { nights: plan.nights, start, end: start ? addDays(start, plan.nights) : null };
}

const blank = (v: string | null | undefined) => !v || !v.trim() || v.trim() === "不明";

/** 標高・気温・地形・地面を、どこから得た値かと一緒にまとめる */
export function buildConditions(
  plan: CampPlanInput,
  raw: Pick<RawDiagnosis, "site_terrain" | "site_ground">,
  location?: PlaceRef | null,
  weather?: ForecastResult | null,
): SiteConditions {
  const gsi = location?.elevation_m ?? null;
  const stay = weather?.available ? weather.forecast.stay : null;
  const fromForecast = stay !== null && (stay.temp_min !== null || stay.temp_max !== null);
  return {
    elevation_m: gsi ?? plan.elevation_m,
    elevation_source: gsi !== null ? "gsi" : plan.elevation_m !== null ? "input" : null,
    temp_min: fromForecast ? stay!.temp_min : plan.expected_low_c,
    temp_max: fromForecast ? stay!.temp_max : plan.expected_high_c,
    temp_source: fromForecast ? "forecast" : plan.expected_low_c !== null || plan.expected_high_c !== null ? "input" : null,
    terrain: plan.terrain ?? (blank(raw.site_terrain) ? null : raw.site_terrain!.trim()),
    terrain_source: plan.terrain ? "input" : blank(raw.site_terrain) ? null : "ai",
    ground: plan.ground ?? (blank(raw.site_ground) ? null : raw.site_ground!.trim()),
    ground_source: plan.ground ? "input" : blank(raw.site_ground) ? null : "ai",
  };
}

/**
 * AIの出力を検証・補正して最終的な診断結果を作る。
 *
 * - gear_id は実在する所持ギアのものだけ採用（AIの幻覚IDを捨てる）
 * - 定番装備(is_base)は必ずパッキングリストに含める（プロンプト任せにしない）
 * - 準備度%・所持件数は同じパッキングリストから計算する（数字の食い違いを防ぐ）
 */
export function finalizeDiagnosis(
  raw: RawDiagnosis,
  gears: Gear[],
  diaryCountUsed: number,
  context: { location?: PlaceRef | null; weather?: ForecastResult | null; plan?: CampPlanInput } = {},
): DiagnosisResult {
  const gearById = new Map(gears.map((g) => [g.id, g]));
  const gearByName = new Map(gears.map((g) => [g.name.trim().toLowerCase(), g]));
  const usedGearIds = new Set<string>();
  const packing: PackingItem[] = [];

  for (const p of raw.packing_list) {
    const name = p.item.trim();
    if (!name) continue;
    // IDが無効でも名前が完全一致すれば所持ギアとみなす
    let gear = p.gear_id ? gearById.get(p.gear_id) : undefined;
    if (!gear) gear = gearByName.get(name.toLowerCase());
    if (gear && usedGearIds.has(gear.id)) continue; // 同じギアの重複を除く
    if (gear) usedGearIds.add(gear.id);

    const category: Category = gear?.category ?? (isCategory(p.category) ? p.category : "other");
    const priority: Priority = gear?.is_base
      ? "must"
      : PRIORITIES.includes(p.priority as Priority)
        ? (p.priority as Priority)
        : "recommended";

    packing.push({
      item: gear?.name ?? name,
      category,
      priority,
      gear_id: gear?.id ?? null,
      owned: Boolean(gear),
      is_base: Boolean(gear?.is_base),
      consumable: p.consumable ?? looksConsumable(gear?.name ?? name),
    });
  }

  for (const g of gears) {
    if (g.is_base && !usedGearIds.has(g.id)) {
      packing.push({
        item: g.name,
        category: g.category,
        priority: "must",
        gear_id: g.id,
        owned: true,
        is_base: true,
        consumable: looksConsumable(g.name),
      });
      usedGearIds.add(g.id);
    }
  }

  const environment_risks = raw.environment_risks.map(cleanRisk);
  const bio_site_risks = raw.bio_site_risks.map(cleanRisk);
  const owned_count = packing.filter((p) => p.owned).length;
  const total_count = packing.length;

  return {
    environment_risks,
    bio_site_risks,
    recommended_tags: normalizeTags(raw.recommended_tags),
    packing_list: packing,
    overall_advice: raw.overall_advice.trim(),
    risk_level: computeRiskLevel([...environment_risks, ...bio_site_risks]),
    readiness_pct: total_count === 0 ? 100 : Math.round((owned_count / total_count) * 100),
    owned_count,
    total_count,
    diary_count_used: diaryCountUsed,
    location: context.location ?? null,
    stay: context.plan ? stayOf(context.plan) : null,
    conditions: context.plan ? buildConditions(context.plan, raw, context.location, context.weather) : null,
    weather: context.weather ?? null,
  };
}
