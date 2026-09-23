import type { DiaryEntry } from "@/lib/domain";

export interface Badge {
  id: string;
  icon: string;
  name: string;
  description: string;
  earned: boolean;
}

type Entry = Pick<DiaryEntry, "weather" | "temp_feel" | "bugs" | "sleep_quality" | "good_gear">;

interface BadgeDef {
  id: string;
  icon: string;
  name: string;
  description: string;
  test: (entries: Entry[]) => boolean;
}

const count = (entries: Entry[], pred: (e: Entry) => boolean) => entries.filter(pred).length;

// プロトタイプと同じ8種類
const BADGES: BadgeDef[] = [
  { id: "first", icon: "🏕️", name: "はじめの一歩", description: "日記を1回記録", test: (e) => e.length >= 1 },
  { id: "three", icon: "🔥", name: "継続キャンパー", description: "日記を3回記録", test: (e) => e.length >= 3 },
  { id: "ten", icon: "⭐", name: "ベテランキャンパー", description: "日記を10回記録", test: (e) => e.length >= 10 },
  { id: "rain", icon: "🌧️", name: "雨キャンプマスター", description: "雨の日を3回記録", test: (e) => count(e, (x) => x.weather === "雨") >= 3 },
  { id: "cold", icon: "🥶", name: "極寒サバイバー", description: "「寒すぎ」を3回記録", test: (e) => count(e, (x) => x.temp_feel === "寒すぎ") >= 3 },
  { id: "bugs", icon: "🦟", name: "虫ハンター", description: "「虫が多い」を3回記録", test: (e) => count(e, (x) => x.bugs === "多い") >= 3 },
  { id: "sleep", icon: "😴", name: "快眠の達人", description: "眠りの質★4以上を5回記録", test: (e) => count(e, (x) => x.sleep_quality >= 4) >= 5 },
  {
    id: "gearmeister",
    icon: "🎒",
    name: "ギアマイスター",
    description: "良かったギアを合計10件記録",
    test: (e) => e.reduce((s, x) => s + x.good_gear.length, 0) >= 10,
  },
];

export function computeBadges(entries: Entry[]): Badge[] {
  return BADGES.map(({ test, ...b }) => ({ ...b, earned: test(entries) }));
}

/** 記録を追加したことで新しく獲得したバッジ（なければ undefined） */
export function newlyEarnedBadge(before: Entry[], after: Entry[]): Badge | undefined {
  const had = new Set(computeBadges(before).filter((b) => b.earned).map((b) => b.id));
  return computeBadges(after).find((b) => b.earned && !had.has(b.id));
}
