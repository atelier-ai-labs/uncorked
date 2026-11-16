-- 1. Global Wine Catalog table
create table if not exists public.wines (
  id bigint generated always as identity primary key,
  producer text not null,
  name text not null,
  vintage int check (vintage is null or (vintage >= 1800 and vintage <= 2100)),
  wine_type text not null default 'red' check (wine_type in ('red', 'white', 'rose', 'sparkling', 'dessert', 'fortified', 'orange')),
  region text,
  sub_region text,
  country text,
  appellation text,
  varietals text[] not null default '{}',
  abv numeric(4,2) check (abv is null or (abv >= 0 and abv <= 100)),
  body text,
  tannin text,
  acidity text,
  sweetness text,
  tasting_notes text[] not null default '{}',
  summary text,
  food_pairings text[] not null default '{}',
  serving_temp text,
  decant_time text,
  drinking_window text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for wines
create index if not exists wines_created_by_idx on public.wines (created_by);
create index if not exists wines_wine_type_idx on public.wines (wine_type);
create index if not exists wines_lookup_idx on public.wines (lower(producer), lower(name), coalesce(vintage, 0));

-- 2. Personal Cellar / Tasting Logs table
create table if not exists public.wine_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  wine_id bigint not null references public.wines(id) on delete cascade,
  rating numeric(2,1) check (rating is null or (rating >= 0.0 and rating <= 5.0)),
  tasting_notes text,
  price_paid numeric(10,2) check (price_paid is null or price_paid >= 0),
  currency text not null default 'USD',
  purchase_location text,
  photo_url text,
  drank_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for wine_logs (FKs + RLS performance)
create index if not exists wine_logs_user_id_idx on public.wine_logs (user_id);
create index if not exists wine_logs_wine_id_idx on public.wine_logs (wine_id);
create index if not exists wine_logs_user_created_idx on public.wine_logs (user_id, created_at desc);

-- 3. Enable Row Level Security
alter table public.wines enable row level security;
alter table public.wine_logs enable row level security;

-- Grant table permissions to authenticated role
grant select, insert, update on public.wines to authenticated;
grant usage, select on sequence public.wines_id_seq to authenticated;

grant select, insert, update, delete on public.wine_logs to authenticated;
grant usage, select on sequence public.wine_logs_id_seq to authenticated;

-- RLS Policies for public.wines (shared catalog)
create policy "wines_select_authenticated"
  on public.wines for select
  to authenticated
  using (true);

create policy "wines_insert_authenticated"
  on public.wines for insert
  to authenticated
  with check ((select auth.uid()) is not null and (created_by is null or created_by = (select auth.uid())));

create policy "wines_update_creator"
  on public.wines for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- RLS Policies for public.wine_logs (strictly personal per user)
create policy "wine_logs_select_own"
  on public.wine_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "wine_logs_insert_own"
  on public.wine_logs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "wine_logs_update_own"
  on public.wine_logs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "wine_logs_delete_own"
  on public.wine_logs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- 4. Create bottle-photos Storage bucket & RLS policies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bottle-photos',
  'bottle-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "bottle_photos_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'bottle-photos');

create policy "bottle_photos_user_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bottle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "bottle_photos_user_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'bottle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'bottle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "bottle_photos_user_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'bottle-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
