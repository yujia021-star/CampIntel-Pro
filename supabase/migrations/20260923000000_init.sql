-- campintel 初期スキーマ
-- gears / diary_entries / camp_plans / ai_requests / allowed_emails

-- ---------------------------------------------------------------
-- 招待制（ホワイトリスト）
-- ---------------------------------------------------------------
-- 身内のメールアドレスだけを登録する。RLSを有効にしてポリシーを作らないので
-- クライアント（anonキー）からは読み書きできない。SQL Editor から管理する。
create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  note text,
  created_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;

-- anonキーは公開されているため、アプリ側のチェックだけでは Supabase Auth API を
-- 直接叩かれると素通りしてしまう。auth.users への INSERT 時点でDB側で拒否する。
create or replace function public.enforce_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null
     or not exists (select 1 from public.allowed_emails a where a.email = lower(new.email)) then
    raise exception 'email_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger enforce_email_allowlist
  before insert on auth.users
  for each row execute function public.enforce_email_allowlist();

-- ---------------------------------------------------------------
-- gears（ギアマスタ）
-- ---------------------------------------------------------------
create table public.gears (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  tags text[] not null default '{}',
  category text not null default 'other' check (category in (
    'shelter_and_sleep', 'fire_and_cooking', 'clothing',
    'safety_and_tools', 'optional_comfort_items', 'other'
  )),
  is_base boolean not null default false,
  created_at timestamptz not null default now()
);
create index gears_user_id_idx on public.gears (user_id, created_at desc);

-- ---------------------------------------------------------------
-- diary_entries（日記）
-- ---------------------------------------------------------------
create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campsite text,
  date date not null,
  weather text not null check (weather in ('晴れ', '曇り', '雨')),
  temp_feel text not null check (temp_feel in ('寒すぎ', 'ちょうどいい', '暑すぎ')),
  bugs text not null check (bugs in ('なし', '少し', '多い')),
  sleep_quality int not null check (sleep_quality between 1 and 5),
  good_gear text[] not null default '{}',
  bad_gear text[] not null default '{}',
  note text,
  created_at timestamptz not null default now()
);
create index diary_entries_user_id_idx on public.diary_entries (user_id, date desc);

-- ---------------------------------------------------------------
-- camp_plans（キャンプ計画と診断結果の履歴）
-- ---------------------------------------------------------------
create table public.camp_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campsite text not null,
  elevation_m int,
  terrain text,
  ground text,
  planned_date date,
  expected_low_c numeric,
  expected_high_c numeric,
  transport text,
  companions text,
  style text,
  -- 診断結果（DiagnosisResult 型の JSON）
  result jsonb,
  created_at timestamptz not null default now()
);
create index camp_plans_user_id_idx on public.camp_plans (user_id, created_at desc);

-- ---------------------------------------------------------------
-- ai_requests（AI呼び出しのレート制限用ログ）
-- ---------------------------------------------------------------
create table public.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index ai_requests_user_created_idx on public.ai_requests (user_id, created_at desc);

-- ---------------------------------------------------------------
-- Row Level Security: user_id = auth.uid() の行のみ読み書き可能
-- ---------------------------------------------------------------
alter table public.gears enable row level security;
alter table public.diary_entries enable row level security;
alter table public.camp_plans enable row level security;
alter table public.ai_requests enable row level security;

create policy "own gears" on public.gears
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own diary entries" on public.diary_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own camp plans" on public.camp_plans
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- レート制限ログは本人が追加・参照のみ（改ざん防止のため更新・削除は不可）
create policy "insert own ai requests" on public.ai_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "read own ai requests" on public.ai_requests
  for select to authenticated
  using (user_id = (select auth.uid()));
