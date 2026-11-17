-- 1. Add bottles_on_hand to public.wine_logs so Corky knows which bottles the user currently owns in stock
alter table public.wine_logs
  add column if not exists bottles_on_hand int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wine_logs_bottles_on_hand_check'
  ) then
    alter table public.wine_logs
      add constraint wine_logs_bottles_on_hand_check
      check (bottles_on_hand >= 0 and bottles_on_hand <= 1000);
  end if;
end $$;

-- 2. Create public.corky_messages table for Corky chat history & rate limiting
create table if not exists public.corky_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  tools_used text[] not null default '{}' check (cardinality(tools_used) <= 15),
  created_at timestamptz not null default now()
);

create index if not exists corky_messages_user_created_idx
  on public.corky_messages (user_id, created_at desc);

alter table public.corky_messages enable row level security;

grant select, insert, delete on public.corky_messages to authenticated;
grant usage, select on sequence public.corky_messages_id_seq to authenticated;

create policy "corky_messages_select_own"
  on public.corky_messages for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "corky_messages_insert_own"
  on public.corky_messages for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "corky_messages_delete_own"
  on public.corky_messages for delete
  to authenticated
  using ((select auth.uid()) = user_id);
;
