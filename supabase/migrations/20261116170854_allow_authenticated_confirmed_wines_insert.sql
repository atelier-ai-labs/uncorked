-- Allow authenticated users to insert their confirmed wine either via save_confirmed_wine_and_log RPC
-- or directly from the confirmation screen Save action (since analyze-wine-label no longer inserts unconfirmed wines).
alter policy "wines_insert_authenticated"
  on public.wines
  to authenticated
  with check (
    (select auth.uid()) is not null
    and created_by = (select auth.uid())
  );
;
