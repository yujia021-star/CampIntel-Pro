import { z } from "zod";

// 構造化出力(output_config.format)で使うスキーマ。
// category の値の範囲はスキーマで縛らず（SDKの変換で説明文になり、
// 少しでも外れるとパース失敗になるため）、プロンプト本文で指示してコード側で補正する。

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
