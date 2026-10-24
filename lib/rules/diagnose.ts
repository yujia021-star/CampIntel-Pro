import type { CampPlanInput, Gear, PlaceRef, Risk } from "@/lib/domain";
import type { RawDiagnosis } from "@/lib/diagnosis";
import { LEVEL_LABELS, type Experience, type FeelTendency } from "@/lib/experience";
import type { ForecastResult } from "@/lib/weather/forecast";
import { matchGears, packingRules } from "./packing";
import { prefectureOf, regionRisks, roadRisks, siteRisks, weatherRisks } from "./risks";
import { minusMinutes, staySun } from "./sun";

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
  c: {
    level: Experience["level"] | null;
    blank: boolean;
    feelsCold: boolean;
    walking: boolean;
    nights: number;
    /** 初日の日の入り（"H:MM"）。場所と日付が分かるとき */
    sunset?: string | null;
  },
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
  if (c.nights > 0 && c.sunset) {
    // 山あいは平地より早く暗くなるので、日の入りの1時間前を目安にする
    const beginner = c.level === "first" || c.level === "beginner" || c.level === null;
    lines.push(
      beginner
        ? `日の入りは${c.sunset}ごろ。山あいは早く暗くなるので、設営は${minusMinutes(c.sunset, 60)}ごろまでに終えると安心です。`
        : `日の入りは${c.sunset}ごろです。`,
    );
  } else if ((c.level === "first" || c.level === "beginner") && c.nights > 0) {
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
  // 行き帰りの早朝も含めるため、日ごとの最低気温も見る
  const dayMins = (forecast?.days ?? []).map((d) => d.temp_min).filter((t): t is number => t !== null);
  const minTemp = dayMins.length ? Math.min(...dayMins) : (forecast?.stay.temp_min ?? null);
  const wet =
    (forecast?.days ?? []).some((d) => (d.precip_sum_mm ?? 0) >= 1) || labels.some((l) => /雨|雪/.test(l));
  const weatherList = forecast
    ? [...weatherRisks(forecast.stay, plan.nights, labels), ...roadRisks({ minTemp, wet, transport: plan.transport })]
    : [];
  const region = regionRisks(site);
  const siteList = siteRisks(site);
  const environment = [...weatherList, ...siteList.filter((r) => r.basis === "terrain")].sort((a, b) => b.severity - a.severity);
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
      sunset: location && plan.planned_date ? staySun(location.lat, location.lon, plan.planned_date, plan.nights).sunset : null,
    }),
    personal: {
      level: experience ? LEVEL_LABELS[experience.experience.level].name : null,
      tendency: experience?.tendency?.summary ?? null,
    },
  };
}
