-- 1. Add status ('cellar' | 'tasted' | 'wishlist') and flavor_tags to public.wine_logs
alter table public.wine_logs
  add column if not exists status text not null default 'cellar';

alter table public.wine_logs
  add column if not exists flavor_tags text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wine_logs_status_check'
  ) then
    alter table public.wine_logs
      add constraint wine_logs_status_check
      check (status in ('cellar', 'tasted', 'wishlist'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'wine_logs_flavor_tags_check'
  ) then
    alter table public.wine_logs
      add constraint wine_logs_flavor_tags_check
      check (cardinality(flavor_tags) <= 20);
  end if;
end $$;

-- Backfill existing zero-stock rows as 'tasted'
update public.wine_logs
   set status = 'tasted'
 where bottles_on_hand = 0
   and status = 'cellar';

create index if not exists wine_logs_user_status_created_idx
  on public.wine_logs (user_id, status, created_at desc);

-- 2. Atomic SECURITY INVOKER RPC to uncork a bottle: decrements stock, flips to 'tasted' on last bottle,
--    updates drank_at to today, and saves optional rating / flavor_tags / tasting_notes in one round-trip.
create or replace function public.uncork_bottle(
  p_log_id bigint,
  p_rating numeric default null,
  p_flavor_tags text[] default null,
  p_tasting_notes text default null
)
returns public.wine_logs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_updated public.wine_logs;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.wine_logs
     set bottles_on_hand = greatest(bottles_on_hand - 1, 0),
         status = case when bottles_on_hand <= 1 then 'tasted' else 'cellar' end,
         drank_at = current_date,
         rating = coalesce(p_rating, rating),
         flavor_tags = case
           when p_flavor_tags is not null then p_flavor_tags[1:20]
           else flavor_tags
         end,
         tasting_notes = case
           when p_tasting_notes is not null then nullif(left(btrim(p_tasting_notes), 4000), '')
           else tasting_notes
         end,
         updated_at = now()
   where id = p_log_id
     and user_id = v_user_id
   returning * into v_updated;

  if not found then
    raise exception 'Wine log not found';
  end if;

  return v_updated;
end;
$$;

revoke all on function public.uncork_bottle(bigint, numeric, text[], text) from public, anon;
grant execute on function public.uncork_bottle(bigint, numeric, text[], text) to authenticated;
