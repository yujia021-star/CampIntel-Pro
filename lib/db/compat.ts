import type { SupabaseClient } from "@supabase/supabase-js";

// 追加の SQL（supabase/migrations/20260924000000_stay_and_diary_link.sql）をまだ実行していない
// データベースでも保存できるよう、未作成の列があれば外して保存し直す。

/** 列が存在しないことによるエラーか（PostgREST: PGRST204 / Postgres: 42703） */
export function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703" || /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? "");
}

export async function insertWithFallback<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  row: T,
  optionalColumns: (keyof T)[],
): Promise<{ id: string | null; error: { code?: string; message?: string } | null; droppedColumns: boolean }> {
  const first = await supabase.from(table).insert(row).select("id").single();
  if (!isMissingColumnError(first.error)) return { id: first.data?.id ?? null, error: first.error, droppedColumns: false };

  const reduced = { ...row };
  for (const c of optionalColumns) delete reduced[c];
  const retry = await supabase.from(table).insert(reduced).select("id").single();
  return { id: retry.data?.id ?? null, error: retry.error, droppedColumns: true };
}
