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
  environment_risks: { title: string; detail: string; severity: number }[];
  bio_site_risks: { title: string; detail: string; severity: number }[];
  recommended_tags: string[];
  packing_list: {
    item: string;
    category: string;
    priority: string;
    reason: string;
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
  return { title: r.title.trim(), detail: r.detail.trim(), severity: clampSeverity(r.severity) };
}

/** 全リスクの severity 平均（小数1桁）。リスクがなければ 1。 */
export function computeRiskLevel(risks: Risk[]): number {
  if (risks.length === 0) return 1;
  const avg = risks.reduce((s, r) => s + r.severity, 0) / risks.length;
  return Math.round(avg * 10) / 10;
}

export interface RiskVerdict {
  label: "問題なし" | "軽度の注意" | "要注意" | "警戒";
  tone: "ok" | "low" | "mid" | "high";
}

export function riskVerdict(level: number): RiskVerdict {
  if (level < 1.75) return { label: "問題なし", tone: "ok" };
  if (level < 2.75) return { label: "軽度の注意", tone: "low" };
  if (level < 3.75) return { label: "要注意", tone: "mid" };
  return { label: "警戒", tone: "high" };
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
      reason: p.reason.trim(),
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
        reason: "定番装備として毎回持っていくギア",
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
    readiness_pct: total_count === 0 ? 0 : Math.round((owned_count / total_count) * 100),
    owned_count,
    total_count,
    diary_count_used: diaryCountUsed,
  };
}
