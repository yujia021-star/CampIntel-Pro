import { dayLabel } from "@/components/WeatherCard";
import { isConsumable, NIGHTS_LABELS, type DiagnosisResult } from "@/lib/domain";
import { staySun } from "@/lib/rules/sun";

// 「いつものAIに相談」で、利用者自身のAI（Gemini・ChatGPTなど）に貼り付ける文章を作る。
// アプリの判定結果と、その人の道具・クセをまとめて渡し、会話は相手のAIに任せる（こちらの料金はかからない）。

export const CONSULT_SERVICES = [
  // ChatGPT は ?q= で質問を入れた状態で開ける。Gemini は開いてから貼り付けてもらう
  { name: "ChatGPT", url: (text: string) => `https://chatgpt.com/?q=${encodeURIComponent(text)}` },
  { name: "Gemini", url: () => "https://gemini.google.com/app" },
] as const;

export function consultText(
  result: DiagnosisResult,
  c: { campsite?: string | null; companions?: string | null; transport?: string | null },
): string {
  const lines: string[] = ["【キャンプの相談】"];
  const loc = result.location;
  const place = loc ? `${loc.name}（${loc.address}${loc.elevation_m != null ? `・標高${loc.elevation_m}m` : ""}）` : c.campsite;
  if (place) lines.push(`行き先：${place}`);
  const stay = result.stay;
  if (stay) {
    const when = stay.start ? `${dayLabel(stay.start)}${stay.end && stay.nights > 0 ? `〜${dayLabel(stay.end)}` : ""}` : "";
    lines.push(`日程：${[when, NIGHTS_LABELS[stay.nights], c.transport, c.companions].filter(Boolean).join("・")}`);
    const sun = loc && stay.start ? staySun(loc.lat, loc.lon, stay.start, stay.nights) : null;
    if (sun?.sunset) lines.push(`日の入り：${sun.sunset}ごろ${stay.nights > 0 && sun.sunrise ? `（翌朝の日の出${sun.sunrise}ごろ）` : ""}`);
  }
  const w = result.weather?.available ? result.weather.forecast.stay : null;
  if (w) {
    lines.push(
      `予報（滞在中）：最低${w.temp_min ?? "?"}℃／最高${w.temp_max ?? "?"}℃／降水確率${w.precip_prob_max ?? "?"}%／最大瞬間風速${w.gust_max_ms ?? "?"}m/s`,
    );
  }
  const owned = result.packing_list.filter((p) => p.owned && !isConsumable(p)).map((p) => p.item);
  if (owned.length) lines.push(`持っているギア：${owned.join("、")}`);
  const need = result.packing_list.filter((p) => !p.owned && !isConsumable(p)).map((p) => p.item);
  if (need.length) lines.push(`アプリが足りないと判定したもの：${need.join("、")}`);
  const risks = [...result.environment_risks, ...result.bio_site_risks]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 4)
    .map((r) => `${r.risk.split("。")[0]}（危険度${r.severity}）`);
  if (risks.length) lines.push(`アプリの判定：${risks.join("、")}`);
  const p = result.personal;
  if (p?.level) lines.push(`私の経験：${p.level}`);
  if (p?.tendency) lines.push(`私のクセ：${p.tendency}`);
  lines.push("", "この条件で、準備で気を付けることを具体的に教えてください。");
  return lines.join("\n");
}
