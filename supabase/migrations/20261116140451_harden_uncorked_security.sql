-- 1. Create AI Scan Rate-Limiting table
create table if not exists public.ai_scan_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_scan_logs_user_created_idx
  on public.ai_scan_logs (user_id, created_at desc);

alter table public.ai_scan_logs enable row level security;

grant select, insert on public.ai_scan_logs to authenticated;
grant usage, select on sequence public.ai_scan_logs_id_seq to authenticated;

create policy "ai_scan_logs_select_own"
  on public.ai_scan_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "ai_scan_logs_insert_own"
  on public.ai_scan_logs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- 2. Harden public.wines RLS using ALTER POLICY (prevent spoofed null created_by and lock catalog updates)
alter table public.wines alter column created_by set default auth.uid();

alter policy "wines_insert_authenticated"
  on public.wines
  to authenticated
  with check ((select auth.uid()) is not null and created_by = (select auth.uid()));

alter policy "wines_update_creator"
  on public.wines
  to authenticated
  using (false)
  with check (false);

-- 3. Add strict length & cardinality CHECK constraints on public.wines and public.wine_logs
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wines_text_lengths_check'
  ) then
    alter table public.wines
      add constraint wines_text_lengths_check check (
        char_length(producer) between 1 and 200
        and char_length(name) between 1 and 200
        and (region is null or char_length(region) <= 200)
        and (sub_region is null or char_length(sub_region) <= 200)
        and (country is null or char_length(country) <= 100)
        and (appellation is null or char_length(appellation) <= 200)
        and (summary is null or char_length(summary) <= 2000)
        and (serving_temp is null or char_length(serving_temp) <= 100)
        and (decant_time is null or char_length(decant_time) <= 100)
        and (drinking_window is null or char_length(drinking_window) <= 100)
        and cardinality(varietals) <= 25
        and cardinality(tasting_notes) <= 25
        and cardinality(food_pairings) <= 25
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'wine_logs_bounds_check'
  ) then
    alter table public.wine_logs
      add constraint wine_logs_bounds_check check (
        (tasting_notes is null or char_length(tasting_notes) <= 4000)
        and (purchase_location is null or char_length(purchase_location) <= 200)
        and (price_paid is null or (price_paid >= 0 and price_paid <= 1000000))
        and (
          photo_url is null
          or photo_url like 'https://upxkwmytzcicatfxuztg.supabase.co/storage/v1/object/public/bottle-photos/%'
        )
      );
  end if;
end $$;

-- 4. Harden Storage RLS policies for bottle-photos using ALTER POLICY
alter policy "bottle_photos_user_insert"
  on storage.objects
  to authenticated
  with check (
    bucket_id = 'bottle-photos'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

alter policy "bottle_photos_user_update"
  on storage.objects
  to authenticated
  using (false)
  with check (false);
;
