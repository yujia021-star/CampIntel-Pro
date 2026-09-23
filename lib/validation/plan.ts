import { z } from "zod";
import type { CampPlanInput, PlaceRef } from "@/lib/domain";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const optNumber = (min: number, max: number) =>
  z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${min}〜${max}の数値で入力してください` });
        return z.NEVER;
      }
      return n;
    });

export const CampPlanInputSchema = z.object({
  campsite: z.string().trim().min(1, "キャンプ場名を入力してください").max(100),
  nights: z.preprocess((v) => (v === undefined || v === null || v === "" ? 1 : Number(v)), z.number().int().min(0).max(2)),
  elevation_m: optNumber(-100, 4000).transform((v) => (v === null ? null : Math.round(v))),
  terrain: optText(50),
  ground: optText(50),
  planned_date: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "日付の形式が不正です"),
  expected_low_c: optNumber(-40, 50),
  expected_high_c: optNumber(-40, 50),
  transport: optText(50),
  companions: optText(100),
  style: optText(100),
}) satisfies z.ZodType<CampPlanInput, unknown>;

/** 検索で選んだ場所（任意）。camp_plans の列ではなく診断結果に保存する */
export const PlaceInputSchema = z
  .object({
    place_name: z.string().trim().min(1).max(200),
    place_address: z.string().trim().max(300).default(""),
    place_lat: z.coerce.number().min(20).max(46),
    place_lon: z.coerce.number().min(122).max(154),
  })
  .transform(
    (p): Omit<PlaceRef, "elevation_m"> => ({
      name: p.place_name,
      address: p.place_address,
      lat: p.place_lat,
      lon: p.place_lon,
    }),
  );

/** フォームの値から、計画の列と（あれば）選んだ場所を取り出す */
export function parseDiagnoseInput(body: unknown) {
  const plan = CampPlanInputSchema.safeParse(body);
  if (!plan.success) return { ok: false as const, message: plan.error.issues[0]?.message ?? "入力が不正です" };
  const b = (body ?? {}) as Record<string, unknown>;
  const place = b.place_lat && b.place_lon ? PlaceInputSchema.safeParse(b) : null;
  if (place && !place.success) return { ok: false as const, message: "選んだ場所の情報が不正です" };
  return { ok: true as const, plan: plan.data, place: place?.data ?? null };
}
