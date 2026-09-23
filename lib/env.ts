function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`環境変数 ${name} が設定されていません（.env.example を参照）`);
  return value;
}

// NEXT_PUBLIC_* はビルド時に埋め込まれるため、process.env.X を直接参照する必要がある
export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  anthropicModel: () => process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  /**
   * アフィリエイトID（任意）。ビルド時に埋め込まれる NEXT_PUBLIC_* にすると、Vercel のビルドキャッシュで
   * 消したはずのIDが残ることがあったため、サーバーで実行時に読んで画面に渡す。前後の空白は取り除く。
   */
  affiliateIds: () => ({
    amazonTag: process.env.AMAZON_ASSOCIATE_TAG?.trim() || undefined,
    rakutenId: process.env.RAKUTEN_AFFILIATE_ID?.trim() || undefined,
  }),
};
