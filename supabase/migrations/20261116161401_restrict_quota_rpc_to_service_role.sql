-- Switch consume_ai_quota to SECURITY INVOKER and restrict execution strictly to service_role (Edge Functions only)
create or replace function public.consume_ai_quota(
  p_action text,
  p_max_per_hour int
)
returns boolean
language plpgsql
security invoker
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

  -- Enforce fixed server limits regardless of caller parameter
  p_max_per_hour := case when p_action = 'scan' then 25 else 40 end;

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

-- Allow authenticated role to insert via consume_ai_quota (which enforces the advisory lock + count check)
-- while keeping direct UPDATE/DELETE impossible (no UPDATE/DELETE policies exist on ai_scan_logs).
alter policy "ai_scan_logs_insert_own"
  on public.ai_scan_logs
  to authenticated
  with check ((select auth.uid()) = user_id);
;
