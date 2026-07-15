-- Remove inherited anonymous RPC access and consolidate legacy owner policies.

revoke execute on function public.add_roadbook_contributor(bigint, text) from anon;
revoke execute on function public.remove_roadbook_contributor(bigint, uuid) from anon;

create index if not exists roadbook_contributors_added_by_idx
  on public.roadbook_contributors (added_by);

create or replace function private.can_read_roadbook(target_roadbook_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.roadbooks r
    where r.id = target_roadbook_id and r.is_public = true
  ) or private.is_roadbook_editor(target_roadbook_id);
$$;

create or replace function private.can_read_stage(target_stage_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stages s
    where s.id = target_stage_id
      and private.can_read_roadbook(s.roadbook_id)
  );
$$;

revoke all on function private.can_read_roadbook(bigint) from public;
revoke all on function private.can_read_stage(bigint) from public;
grant execute on function private.can_read_roadbook(bigint) to authenticated, service_role;
grant execute on function private.can_read_stage(bigint) to authenticated, service_role;

drop policy if exists "Anyone can read public roadbooks" on public.roadbooks;
drop policy if exists "Owner can read own roadbooks" on public.roadbooks;
drop policy if exists "Owner can update roadbooks" on public.roadbooks;
drop policy if exists "Owner can delete roadbooks" on public.roadbooks;
drop policy if exists "Editors can read shared roadbooks" on public.roadbooks;

create policy "Anyone can read public roadbooks"
  on public.roadbooks for select to anon
  using (is_public = true);
create policy "Editors can read shared roadbooks"
  on public.roadbooks for select to authenticated
  using (private.can_read_roadbook(id));

drop policy if exists "Anyone can read stages of public roadbooks" on public.stages;
drop policy if exists "Owner can read stages of own roadbooks" on public.stages;
drop policy if exists "Owner can insert stages" on public.stages;
drop policy if exists "Owner can update stages" on public.stages;
drop policy if exists "Owner can delete stages" on public.stages;
drop policy if exists "Editors can read stages" on public.stages;

create policy "Anyone can read stages of public roadbooks"
  on public.stages for select to anon
  using (exists (select 1 from public.roadbooks r where r.id = roadbook_id and r.is_public = true));
create policy "Editors can read stages"
  on public.stages for select to authenticated
  using (private.can_read_roadbook(roadbook_id));

drop policy if exists "Anyone can read pois of public roadbooks" on public.stage_pois;
drop policy if exists "Owner can read pois of own roadbooks" on public.stage_pois;
drop policy if exists "Owner can insert pois" on public.stage_pois;
drop policy if exists "Owner can update pois" on public.stage_pois;
drop policy if exists "Owner can delete pois" on public.stage_pois;
drop policy if exists "Editors can read pois" on public.stage_pois;

create policy "Anyone can read pois of public roadbooks"
  on public.stage_pois for select to anon
  using (exists (
    select 1 from public.stages s
    join public.roadbooks r on r.id = s.roadbook_id
    where s.id = stage_id and r.is_public = true
  ));
create policy "Editors can read pois"
  on public.stage_pois for select to authenticated
  using (private.can_read_stage(stage_id));

drop policy if exists "Anyone can read variants of public roadbooks" on public.stage_variants;
drop policy if exists "Owner can read variants of own roadbooks" on public.stage_variants;
drop policy if exists "Owner can insert variants" on public.stage_variants;
drop policy if exists "Owner can update variants" on public.stage_variants;
drop policy if exists "Owner can delete variants" on public.stage_variants;
drop policy if exists "Editors can read variants" on public.stage_variants;

create policy "Anyone can read variants of public roadbooks"
  on public.stage_variants for select to anon
  using (exists (
    select 1 from public.stages s
    join public.roadbooks r on r.id = s.roadbook_id
    where s.id = stage_id and r.is_public = true
  ));
create policy "Editors can read variants"
  on public.stage_variants for select to authenticated
  using (private.can_read_stage(stage_id));

drop policy if exists "Anyone can read media of public roadbooks" on public.media;
drop policy if exists "Owner can read media of own roadbooks" on public.media;
drop policy if exists "Editors can read media" on public.media;

create policy "Anyone can read media of public roadbooks"
  on public.media for select to anon
  using (exists (select 1 from public.roadbooks r where r.id = roadbook_id and r.is_public = true));
create policy "Editors can read media"
  on public.media for select to authenticated
  using (private.can_read_roadbook(roadbook_id));

drop policy if exists "roadbook_media_public_read" on storage.objects;
drop policy if exists "roadbook_media_owner_read" on storage.objects;

create policy "roadbook_media_public_read"
on storage.objects for select to anon
using (
  bucket_id in ('roadbook-images', 'roadbook-gpx')
  and storage.allow_any_operation(array[
    'object.sign', 'object.sign_many', 'object.get_authenticated', 'object.get_authenticated_info'
  ])
  and exists (
    select 1 from public.media m
    join public.roadbooks r on r.id = m.roadbook_id
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and r.is_public = true
  )
);

create policy "roadbook_media_owner_read"
on storage.objects for select to authenticated
using (
  bucket_id in ('roadbook-images', 'roadbook-gpx')
  and storage.allow_any_operation(array[
    'object.sign', 'object.sign_many', 'object.get_authenticated',
    'object.get_authenticated_info', 'object.upload',
    'object.upload_update', 'object.delete_many'
  ])
  and exists (
    select 1 from public.media m
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and private.can_read_roadbook(m.roadbook_id)
  )
);
