import { z } from "zod";

// 構造化出力(output_config.format)で使うスキーマ。
// category / priority / severity の値の範囲はスキーマで縛らず（SDKの変換で説明文になり、
// 少しでも外れるとパース失敗になるため）、プロンプト本文で指示してコード側で補正する。

const RiskSchema = z.object({
  risk: z.string(),
  severity: z.number(),
  basis: z.string(),
});

export const DiagnosisOutputSchema = z.object({
  site_terrain: z.string(),
  site_ground: z.string(),
  environment_risks: z.array(RiskSchema),
  bio_site_risks: z.array(RiskSchema),
  recommended_tags: z.array(z.string()),
  packing_list: z.array(
    z.object({
      item: z.string(),
      category: z.string(),
      priority: z.string(),
      gear_id: z.string().nullable(),
      consumable: z.boolean(),
    }),
  ),
  overall_advice: z.string(),
});

export const GearSuggestionSchema = z.object({
  tags: z.array(z.string()),
  category: z.string(),
});

export const GearRecognitionSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      tags: z.array(z.string()),
      category: z.string(),
    }),
  ),
});
