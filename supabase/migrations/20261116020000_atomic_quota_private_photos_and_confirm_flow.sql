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

-- Atomic, serialized rate-limit check + increment using transaction-scoped advisory lock.
-- Because ai_scan_logs has NO UPDATE and NO DELETE RLS policies, users can never delete or reset accounting records.
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

-- 3. Require authenticated creator match on public.wines INSERT policy
alter policy "wines_insert_authenticated"
  on public.wines
  to authenticated
  with check (
    (select auth.uid()) is not null
    and created_by = (select auth.uid())
  );

-- 4. Server-enforced confirmation boundary for saving a reviewed wine profile + personal cellar log
create or replace function public.save_confirmed_wine_and_log(
  p_wine_id bigint default null,
  p_producer text default null,
  p_name text default null,
  p_vintage int default null,
  p_wine_type text default 'red',
  p_region text default null,
  p_sub_region text default null,
  p_country text default null,
  p_appellation text default null,
  p_varietals text[] default '{}',
  p_abv numeric default null,
  p_body text default null,
  p_tannin text default null,
  p_acidity text default null,
  p_sweetness text default null,
  p_tasting_notes text[] default '{}',
  p_summary text default null,
  p_food_pairings text[] default '{}',
  p_serving_temp text default null,
  p_decant_time text default null,
  p_drinking_window text default null,
  p_rating numeric default null,
  p_price_paid numeric default null,
  p_purchase_location text default null,
  p_bottles_on_hand int default 1,
  p_personal_notes text default null,
  p_photo_url text default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_final_wine_id bigint;
  v_log_id bigint;
  v_clean_producer text;
  v_clean_name text;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_clean_producer := left(btrim(coalesce(p_producer, '')), 200);
  v_clean_name := left(btrim(coalesce(p_name, '')), 200);

  if v_clean_producer = '' or v_clean_name = '' then
    raise exception 'Producer and wine name are required';
  end if;

  if p_wine_id is not null then
    select w.id
      into v_final_wine_id
      from public.wines w
     where w.id = p_wine_id
       and lower(w.producer) = lower(v_clean_producer)
       and lower(w.name) = lower(v_clean_name)
       and coalesce(w.vintage, 0) = coalesce(p_vintage, 0)
     limit 1;
  end if;

  if v_final_wine_id is null then
    select w.id
      into v_final_wine_id
      from public.wines w
     where lower(w.producer) = lower(v_clean_producer)
       and lower(w.name) = lower(v_clean_name)
       and coalesce(w.vintage, 0) = coalesce(p_vintage, 0)
     limit 1;
  end if;

  -- Only insert into the shared catalog AFTER the user has reviewed & confirmed the bottle details
  if v_final_wine_id is null then
    perform pg_catalog.set_config('app.via_confirmed_rpc', 'true', true);

    insert into public.wines (
      producer,
      name,
      vintage,
      wine_type,
      region,
      sub_region,
      country,
      appellation,
      varietals,
      abv,
      body,
      tannin,
      acidity,
      sweetness,
      tasting_notes,
      summary,
      food_pairings,
      serving_temp,
      decant_time,
      drinking_window,
      created_by
    )
    values (
      v_clean_producer,
      v_clean_name,
      p_vintage,
      coalesce(p_wine_type, 'red'),
      nullif(left(btrim(coalesce(p_region, '')), 200), ''),
      nullif(left(btrim(coalesce(p_sub_region, '')), 200), ''),
      nullif(left(btrim(coalesce(p_country, '')), 100), ''),
      nullif(left(btrim(coalesce(p_appellation, '')), 200), ''),
      coalesce(p_varietals[1:20], '{}'),
      p_abv,
      nullif(left(btrim(coalesce(p_body, '')), 50), ''),
      nullif(left(btrim(coalesce(p_tannin, '')), 50), ''),
      nullif(left(btrim(coalesce(p_acidity, '')), 50), ''),
      nullif(left(btrim(coalesce(p_sweetness, '')), 50), ''),
      coalesce(p_tasting_notes[1:20], '{}'),
      nullif(left(btrim(coalesce(p_summary, '')), 2000), ''),
      coalesce(p_food_pairings[1:20], '{}'),
      nullif(left(btrim(coalesce(p_serving_temp, '')), 100), ''),
      nullif(left(btrim(coalesce(p_decant_time, '')), 100), ''),
      nullif(left(btrim(coalesce(p_drinking_window, '')), 100), ''),
      v_user_id
    )
    returning id into v_final_wine_id;
  end if;

  insert into public.wine_logs (
    user_id,
    wine_id,
    rating,
    price_paid,
    purchase_location,
    bottles_on_hand,
    tasting_notes,
    photo_url
  )
  values (
    v_user_id,
    v_final_wine_id,
    p_rating,
    p_price_paid,
    nullif(left(btrim(coalesce(p_purchase_location, '')), 200), ''),
    coalesce(p_bottles_on_hand, 1),
    nullif(left(btrim(coalesce(p_personal_notes, '')), 4000), ''),
    p_photo_url
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.save_confirmed_wine_and_log(
  bigint, text, text, int, text, text, text, text, text, text[], numeric,
  text, text, text, text, text[], text, text[], text, text, text,
  numeric, numeric, text, int, text, text
) from public, anon;

grant execute on function public.save_confirmed_wine_and_log(
  bigint, text, text, int, text, text, text, text, text, text[], numeric,
  text, text, text, text, text[], text, text[], text, text, text,
  numeric, numeric, text, int, text, text
) to authenticated;
