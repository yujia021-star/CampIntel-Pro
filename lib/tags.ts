/** タグを正規化する: 先頭の # を除去、小文字化、前後空白除去、空・重複を除く */
export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const n = normalizeTag(t);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** 「#防寒, #冬 雨」のような入力文字列をタグ配列にする */
export function parseTagInput(input: string): string[] {
  return normalizeTags(input.split(/[,、\s]+/));
}
