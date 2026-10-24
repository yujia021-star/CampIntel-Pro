import type { CampPlanInput, Gear, PlaceRef, Risk } from "@/lib/domain";
import type { RawDiagnosis } from "@/lib/diagnosis";
import { LEVEL_LABELS, type Experience, type FeelTendency } from "@/lib/experience";
import type { ForecastResult } from "@/lib/weather/forecast";
import { matchGears, packingRules } from "./packing";
import { prefectureOf, regionRisks, siteRisks, weatherRisks } from "./risks";

// 診断をルールだけで組み立てる（AIを使わない）。結果はすぐ出て、料金0円、同じ条件なら毎回同じ。

export interface RuleInput {
  plan: CampPlanInput;
  location: PlaceRef | null;
  weather: ForecastResult | null;
  gears: Gear[];
  experience: { experience: Experience; tendency: FeelTendency | null } | null;
  /** 今日（日本時間）。予定日がないときの季節に使う */
  today: string;
}

const short = (r: Risk) => r.risk.split("。")[0];

/** 総合アドバイス（いちばん高いリスク・持ち物の数・経験に合わせた一言） */
export function adviceText(
  risks: Risk[],
  counts: { needGear: number; consumables: number },
  c: { level: Experience["level"] | null; blank: boolean; feelsCold: boolean; walking: boolean; nights: number },
): string {
  const lines: string[] = [];
  const top = [...risks].sort((a, b) => b.severity - a.severity)[0];
  if (top && top.severity >= 3) lines.push(`いちばん気を付けたいのは「${short(top)}」です。`);
  else lines.push("大きな心配は少ない条件です。");
  if (c.feelsCold) lines.push("予報より寒く感じやすいので、防寒は一段手厚めに。");
  lines.push(
    counts.needGear > 0
      ? `足りないギアが${counts.needGear}件あります。持ち物リストで確認しましょう。`
      : "ギアはマイギアでそろっています。",
  );
  if (counts.consumables > 0) lines.push(`消耗品${counts.consumables}件は残りを確認してください。`);
  if (c.walking && c.nights > 0) lines.push("徒歩・公共交通機関なので、軽さを優先して荷物をしぼりましょう。");
  if ((c.level === "first" || c.level === "beginner") && c.nights > 0) {
    lines.push("設営は明るいうち（15時ごろまで）に終えると安心です。");
  }
  if (c.blank) lines.push("久しぶりの時期があるので、出発前に道具の動作を確認しておきましょう。");
  return lines.join("");
}

export function ruleDiagnosis(input: RuleInput): RawDiagnosis & { personal: { level: string | null; tendency: string | null } } {
  const { plan, location, weather, gears, experience } = input;
  const month = Number((plan.planned_date ?? input.today).slice(5, 7));
  const forecast = weather?.available ? weather.forecast : null;
  const labels = forecast ? [...forecast.days.map((d) => d.weather), ...forecast.hours.map((h) => h.weather)] : [];
  const site = {
    month,
    prefecture: prefectureOf(location?.address) ?? prefectureOf(location?.name),
    elevation_m: location?.elevation_m ?? plan.elevation_m,
    nights: plan.nights,
    transport: plan.transport,
    companions: plan.companions,
  };
  const weatherList = forecast ? weatherRisks(forecast.stay, plan.nights, labels) : [];
  const region = regionRisks(site);
  const siteList = siteRisks(site);
  const environment = [...weatherList, ...siteList.filter((r) => r.basis === "terrain")];
  const bio = [...region, ...siteList.filter((r) => r.basis !== "terrain")];
  const feelsCold = experience?.tendency?.kind === "cold";

  const items = packingRules({
    nights: plan.nights,
    month,
    stay: forecast?.stay ?? null,
    labels,
    transport: plan.transport,
    companions: plan.companions,
    bear: region.some((r) => /クマ|グマ/.test(r.risk)),
    feelsCold,
  });
  const packing = matchGears(items, gears);
  // 「足りないギア」は今回の条件で必要な物と必須の物だけ（定番の物は別に確認してもらう）
  const needGear = packing.filter((p) => !p.gear_id && !p.consumable && (p.priority === "must" || !p.routine)).length;
  const consumables = packing.filter((p) => p.consumable).length;

  return {
    environment_risks: environment,
    bio_site_risks: bio,
    recommended_tags: [],
    packing_list: packing.map((p) => ({ ...p })),
    overall_advice: adviceText([...environment, ...bio], { needGear, consumables }, {
      level: experience?.experience.level ?? null,
      blank: experience?.experience.blank ?? false,
      feelsCold,
      walking: Boolean(plan.transport && /徒歩|公共交通/.test(plan.transport)),
      nights: plan.nights,
    }),
    personal: {
      level: experience ? LEVEL_LABELS[experience.experience.level].name : null,
      tendency: experience?.tendency?.summary ?? null,
    },
  };
}
