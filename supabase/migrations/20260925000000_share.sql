-- 診断結果の共有リンク（ログインしていない人も見られる）
-- share_token を持つ診断だけを、トークンを知っている人が読める。
-- テーブルの RLS は変えず、読み取り専用の関数（security definer）だけを公開する。

alter table public.camp_plans add column if not exists share_token uuid unique;

create or replace function public.get_shared_plan(token uuid)
returns table (
  campsite text,
  planned_date date,
  nights int,
  companions text,
  result jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.campsite, p.planned_date, p.nights, p.companions, p.result, p.created_at
  from public.camp_plans p
  where token is not null and p.share_token = token;
$$;

revoke all on function public.get_shared_plan(uuid) from public;
grant execute on function public.get_shared_plan(uuid) to anon, authenticated;
