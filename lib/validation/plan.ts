import { z } from "zod";
import type { CampPlanInput } from "@/lib/domain";

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
