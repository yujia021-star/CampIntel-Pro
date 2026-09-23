import {
  isCategory,
  type Category,
  type DiagnosisResult,
  type Gear,
  type PackingItem,
  type Priority,
  type Risk,
} from "@/lib/domain";
import { normalizeTags } from "@/lib/tags";

/** AIが返す生の診断結果（lib/ai/schemas.ts の DiagnosisOutputSchema と同形） */
export interface RawDiagnosis {
  environment_risks: { risk: string; severity: number }[];
  bio_site_risks: { risk: string; severity: number }[];
  recommended_tags: string[];
  packing_list: {
    item: string;
    category: string;
    priority: string;
    gear_id: string | null;
  }[];
  overall_advice: string;
}

const PRIORITIES: Priority[] = ["must", "recommended", "optional"];

function clampSeverity(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function cleanRisk(r: RawDiagnosis["environment_risks"][number]): Risk {
  return { risk: r.risk.trim(), severity: clampSeverity(r.severity) };
}

/** 全リスクの severity 平均（小数1桁）。リスクがなければ 0。 */
export function computeRiskLevel(risks: Risk[]): number {
  if (risks.length === 0) return 0;
  const avg = risks.reduce((s, r) => s + r.severity, 0) / risks.length;
  return Math.round(avg * 10) / 10;
}

export type Tone = "ok" | "low" | "mid" | "high";

export interface RiskVerdict {
  title: string;
  text: string;
  tone: Tone;
}

// 目安: 〜2未満=問題なし / 2〜3=軽度の注意 / 3〜4=要注意 / 4以上=警戒
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
      text: "しっかりとした対策が必要なレベルです。装備を万全にし、行動計画にも余裕を持たせましょう。",
    };
  return {
    title: "🔴 警戒",
    tone: "high",
    text: "重大なリスクがあります。対策が難しい場合は、日程の変更や中止も検討してください。",
  };
}

/** リスクレベル（平均）の色分け: 4以上=赤 / 2.5以上=黄 / それ未満=緑 */
export function riskLevelTone(level: number): Tone {
  if (level >= 4) return "high";
  if (level >= 2.5) return "low";
  return "ok";
}

/** 個々のリスクの深刻度ラベル */
export function severityLabel(severity: number): { label: string; tone: Tone } {
  if (severity >= 4) return { label: "重大", tone: "high" };
  if (severity === 3) return { label: "中程度", tone: "low" };
  return { label: "軽微", tone: "ok" };
}

/**
 * AIの出力を検証・補正して最終的な診断結果を作る。
 *
 * - gear_id は実在する所持ギアのものだけ採用（AIの幻覚IDを捨てる）
 * - 定番装備(is_base)は必ずパッキングリストに含める（プロンプト任せにしない）
 * - 準備度%・所持件数は同じパッキングリストから計算する（数字の食い違いを防ぐ）
 */
export function finalizeDiagnosis(raw: RawDiagnosis, gears: Gear[], diaryCountUsed: number): DiagnosisResult {
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
  };
}
