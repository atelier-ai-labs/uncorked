-- 1. Upgrade public.ai_scan_logs for atomic server-controlled rate limiting
alter table public.ai_scan_logs
  add column if not exists action text not null default 'scan';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_scan_logs_action_check'
  ) then
    alter table public.ai_scan_logs
      add constraint ai_scan_logs_action_check
      check (action in ('scan', 'corky'));
  end if;
end $$;

create index if not exists ai_scan_logs_user_action_created_idx
  on public.ai_scan_logs (user_id, action, created_at desc);

-- Block direct client INSERT on ai_scan_logs; only the atomic RPC can insert accounting records
alter policy "ai_scan_logs_insert_own"
  on public.ai_scan_logs
  to authenticated
  with check (false);

-- Atomic, serialized rate-limit check + increment using transaction-scoped advisory lock
create or replace function public.consume_ai_quota(
  p_action text,
  p_max_per_hour int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_recent_count int;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_action not in ('scan', 'corky') then
    raise exception 'Invalid quota action';
  end if;

  if p_max_per_hour <= 0 or p_max_per_hour > 200 then
    raise exception 'Invalid quota limit';
  end if;

  -- Serialize concurrent quota checks for the same (user_id, action) within this transaction
  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_action));

  select count(*)
    into v_recent_count
    from public.ai_scan_logs
   where user_id = v_user_id
     and action = p_action
     and created_at >= (now() - interval '1 hour');

  if v_recent_count >= p_max_per_hour then
    return false;
  end if;

  insert into public.ai_scan_logs (user_id, action)
  values (v_user_id, p_action);

  return true;
end;
$$;

revoke all on function public.consume_ai_quota(text, int) from public, anon;
grant execute on function public.consume_ai_quota(text, int) to authenticated;

-- 2. Make bottle-photos Storage bucket private and restrict SELECT to owner only
update storage.buckets
   set public = false
 where id = 'bottle-photos';

alter policy "bottle_photos_public_read"
  on storage.objects
  to authenticated
  using (
    bucket_id = 'bottle-photos'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 3. Update wine_logs_bounds_check to accept private storage object paths (<user_id>/<timestamp>.jpg)
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'wine_logs_bounds_check'
  ) then
    alter table public.wine_logs
      rename constraint wine_logs_bounds_check to wine_logs_bounds_check_old;
    alter table public.wine_logs
      validate constraint wine_logs_bounds_check_old;
  end if;
end $$;
;
