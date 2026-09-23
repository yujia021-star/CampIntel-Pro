// キャンプ経験のレベル判定と、体感のクセ（純粋な計算。DB・画面から独立させてテストする）
//
// ベテラン＝「条件が変わっても、自分で準備と判断ができる人」。互いに重ならない3つの軸で測る:
//   量  : どれだけ行ったか … 通算の泊数（デイキャンプは数えない。2泊は2）
//   幅  : どんな条件で行ったか … 雨／寒い夜（最低5℃以下）／熱帯夜（夜の最低25℃以上）／連泊
//   鮮度: いつ行ったか … 直近12か月を3か月ずつ4区間に分け、泊まりで行った区間の数
// レベルは上から順に判定するので、必ずどれか1つに入る。

export const CONDITIONS = ["rain", "cold", "tropical", "multi"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<Condition, string> = {
  rain: "雨の日",
  cold: "寒い夜（最低5℃以下）",
  tropical: "熱帯夜（夜の最低25℃以上）",
  multi: "連泊",
};

export const COLD_MAX_C = 5;
export const TROPICAL_MIN_C = 25;

/** 以前の申告は「5〜9泊」のような幅で聞いていた。その申告は幅の下限として読む */
export const LEGACY_PRIOR_NIGHTS = ["0", "1-4", "5-9", "10+"] as const;
export const LEGACY_PRIOR_NIGHTS_MIN: Record<(typeof LEGACY_PRIOR_NIGHTS)[number], number> = { "0": 0, "1-4": 1, "5-9": 5, "10+": 10 };
export const PRIOR_NIGHTS_MAX = 999;

export const WINDOW_LABELS = ["直近3か月", "3〜6か月前", "6〜9か月前", "9〜12か月前"] as const;

/** アプリを使う前の経験の自己申告（最初に1回。あとから直せる） */
export interface SelfReport {
  /** アプリを使う前の泊数 */
  prior_nights: number;
  conditions: Condition[];
  /** 申告した時点から見て、泊まりで行った区間（0=直近3か月 … 3=9〜12か月前） */
  windows: number[];
  reported_at: string; // "YYYY-MM-DD"
}

/** 判定に使う1回分のキャンプ（日記から作る） */
export interface Trip {
  date: string;
  nights: number;
  weather: string;
  temp_feel: string;
  /** ひも付いた診断の予報の、滞在中の最低気温 */
  forecast_min: number | null;
}

export type Level = "first" | "beginner" | "intermediate" | "veteran";
export const LEVEL_LABELS: Record<Level, { icon: string; name: string }> = {
  first: { icon: "🌱", name: "はじめて" },
  beginner: { icon: "🔰", name: "ビギナー" },
  intermediate: { icon: "🏕️", name: "中級" },
  veteran: { icon: "🔥", name: "ベテラン" },
};

export const VETERAN = { nights: 10, conditions: 3, windows: 4 };
export const INTERMEDIATE = { nights: 5, conditions: 2 };

export interface Experience {
  level: Level;
  nights: number;
  conditions: Condition[];
  /** 直近12か月の4区間それぞれで泊まりで行ったか（0=直近3か月） */
  windows: boolean[];
  /** ベテランの量と幅はあるが、鮮度が足りない */
  blank: boolean;
  /** 次のレベルに足りないこと */
  next: string[];
  reported: boolean;
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addMonths(date: string, months: number): string {
  const d = toUtc(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** 今日から見て、その日付が直近12か月のどの区間か（0〜3）。範囲外は null */
export function windowIndex(date: string, today: string): number | null {
  if (date > today) return null;
  for (let k = 0; k < 4; k++) {
    if (date > addMonths(today, -3 * (k + 1))) return k;
  }
  return null;
}

/** 日記の1件がどの条件を満たすか。予報があれば数値で、なければ体感で判断する */
export function tripConditions(t: Trip): Condition[] {
  const out: Condition[] = [];
  if (t.weather === "雨") out.push("rain");
  if (t.forecast_min !== null ? t.forecast_min <= COLD_MAX_C : t.temp_feel === "寒すぎ") out.push("cold");
  if (t.forecast_min !== null ? t.forecast_min >= TROPICAL_MIN_C : t.temp_feel === "暑すぎ") out.push("tropical");
  if (t.nights >= 2) out.push("multi");
  return out;
}

export function computeExperience(trips: Trip[], report: SelfReport | null, today: string): Experience {
  const overnight = trips.filter((t) => t.nights >= 1);
  const nights = overnight.reduce((s, t) => s + t.nights, 0) + (report?.prior_nights ?? 0);

  const cond = new Set<Condition>(report?.conditions ?? []);
  for (const t of overnight) for (const c of tripConditions(t)) cond.add(c);
  const conditions = CONDITIONS.filter((c) => cond.has(c));

  const windows = [false, false, false, false];
  for (const t of overnight) {
    const k = windowIndex(t.date, today);
    if (k !== null) windows[k] = true;
  }
  // 申告した区間は、申告日から見た区間の真ん中の日に行ったとみなす（時間がたつと古くなって外れる）
  if (report) {
    for (const w of report.windows) {
      const mid = addDaysStr(addMonths(report.reported_at, -3 * w), -45);
      const k = windowIndex(mid, today);
      if (k !== null) windows[k] = true;
    }
  }
  const fresh = windows.filter(Boolean).length;

  const vetBase = nights >= VETERAN.nights && conditions.length >= VETERAN.conditions;
  const level: Level =
    vetBase && fresh >= VETERAN.windows
      ? "veteran"
      : nights >= INTERMEDIATE.nights && conditions.length >= INTERMEDIATE.conditions
        ? "intermediate"
        : nights >= 1
          ? "beginner"
          : "first";

  const missing = CONDITIONS.filter((c) => !cond.has(c)).map((c) => CONDITION_LABELS[c]);
  const next: string[] = [];
  const target = level === "veteran" ? null : level === "intermediate" ? VETERAN : level === "beginner" ? INTERMEDIATE : null;
  if (level === "first") next.push("まずは1泊してみましょう");
  if (target) {
    if (nights < target.nights) next.push(`あと${target.nights - nights}泊`);
    const needCond = target.conditions - conditions.length;
    if (needCond > 0) next.push(`まだの条件を${needCond}つ（${missing.join("・")}）`);
    if (target === VETERAN && fresh < VETERAN.windows) {
      // 過去の区間は埋め直せないので、「これからのペース」として伝える
      next.push(`3か月に1回以上のペースで泊まる（直近1年は4区間中${fresh}区間）`);
    }
  }
  return { level, nights, conditions, windows, blank: vetBase && fresh < VETERAN.windows, next, reported: Boolean(report) };
}

function addDaysStr(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------
// 体感のクセ（予報とひも付いた泊まりの日記から）
// ---------------------------------------------------------------

export const TENDENCY_MIN_SAMPLES = 3;

export interface FeelTendency {
  kind: "cold" | "hot" | "neutral";
  summary: string;
  detail: string;
  samples: number;
}

export function feelTendency(trips: Trip[]): FeelTendency | null {
  const s = trips.filter((t) => t.nights >= 1 && t.forecast_min !== null);
  if (s.length < TENDENCY_MIN_SAMPLES) return null;
  const count = (f: string) => s.filter((t) => t.temp_feel === f).length;
  const avg = (f: string) => {
    const xs = s.filter((t) => t.temp_feel === f).map((t) => t.forecast_min!);
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
  };
  const cold = count("寒すぎ");
  const hot = count("暑すぎ");
  const n = s.length;
  if (cold / n >= 0.5) {
    return {
      kind: "cold",
      summary: "予報より寒く感じやすいタイプ",
      detail: `${n}回中${cold}回「寒すぎ」（そのときの予報の最低気温は平均${avg("寒すぎ")}℃）`,
      samples: n,
    };
  }
  if (hot / n >= 0.5) {
    return {
      kind: "hot",
      summary: "予報より暑く感じやすいタイプ",
      detail: `${n}回中${hot}回「暑すぎ」（そのときの予報の最低気温は平均${avg("暑すぎ")}℃）`,
      samples: n,
    };
  }
  return {
    kind: "neutral",
    summary: "予報どおりに感じることが多いタイプ",
    detail: `${n}回中${count("ちょうどいい")}回「ちょうどいい」`,
    samples: n,
  };
}
