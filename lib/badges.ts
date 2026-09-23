import type { DiaryEntry } from "@/lib/domain";

export interface Badge {
  id: string;
  icon: string;
  name: string;
  description: string;
  earned: boolean;
}

type Entry = Pick<DiaryEntry, "campsite" | "weather" | "temp_feel" | "bugs" | "sleep_quality" | "good_gear" | "bad_gear" | "note">;

interface BadgeDef {
  id: string;
  icon: string;
  name: string;
  description: string;
  test: (entries: Entry[]) => boolean;
}

const distinctCampsites = (entries: Entry[]) =>
  new Set(entries.map((e) => e.campsite?.trim().toLowerCase()).filter(Boolean)).size;

const BADGES: BadgeDef[] = [
  { id: "first", icon: "🌱", name: "はじめの一歩", description: "日記を初めて記録", test: (e) => e.length >= 1 },
  { id: "three", icon: "🔥", name: "焚き火仲間", description: "日記を3件記録", test: (e) => e.length >= 3 },
  { id: "ten", icon: "🏆", name: "ベテランキャンパー", description: "日記を10件記録", test: (e) => e.length >= 10 },
  { id: "rain", icon: "☔", name: "雨キャンパー", description: "雨のキャンプを記録", test: (e) => e.some((x) => x.weather === "雨") },
  { id: "cold", icon: "🥶", name: "寒さに耐えた", description: "「寒すぎ」の夜を記録", test: (e) => e.some((x) => x.temp_feel === "寒すぎ") },
  { id: "bugs", icon: "🦟", name: "虫との戦い", description: "虫が「多い」キャンプを記録", test: (e) => e.some((x) => x.bugs === "多い") },
  { id: "sleep", icon: "😴", name: "快眠マスター", description: "眠りの質5を記録", test: (e) => e.some((x) => x.sleep_quality >= 5) },
  { id: "explorer", icon: "🧭", name: "開拓者", description: "3か所以上のキャンプ場を記録", test: (e) => distinctCampsites(e) >= 3 },
];

export function computeBadges(entries: Entry[]): Badge[] {
  return BADGES.map(({ test, ...b }) => ({ ...b, earned: test(entries) }));
}
