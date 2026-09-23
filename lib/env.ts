function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`環境変数 ${name} が設定されていません（.env.example を参照）`);
  return value;
}

// NEXT_PUBLIC_* はビルド時に埋め込まれるため、process.env.X を直接参照する必要がある
export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  anthropicModel: () => process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  aiHourlyLimit: () => Number(process.env.AI_HOURLY_LIMIT ?? 30) || 30,
};
