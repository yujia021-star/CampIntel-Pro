-- デイキャンプ・連泊と、診断した計画と日記のひも付け

-- 計画の泊数（0 = デイキャンプ、1〜2 = 泊数）
alter table public.camp_plans
  add column if not exists nights int not null default 1 check (nights between 0 and 2);

-- 日記の泊数と、もとになった計画（計画を消しても日記は残す）
alter table public.diary_entries
  add column if not exists nights int check (nights between 0 and 2),
  add column if not exists plan_id uuid references public.camp_plans (id) on delete set null;

create index if not exists diary_entries_plan_id_idx on public.diary_entries (plan_id);
