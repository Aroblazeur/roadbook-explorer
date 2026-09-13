drop policy if exists "Editors can read shared roadbooks" on public.roadbooks;

create policy "Editors can read shared roadbooks"
on public.roadbooks
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or private.can_read_roadbook(id)
);
